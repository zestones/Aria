"""Tests for ``agents.work_order_generator`` (issue #30 / M5.1).

Covers the acceptance items that are testable without a live Anthropic
call, live MCP, or live database:

- Happy path: one LLM turn calling ``submit_work_order`` results in an
  UPDATE with all required fields (non-null) and ``status='open'``, plus
  a ``work_order_ready`` broadcast.
- ``render_work_order_card`` is intercepted and fans out ``ui_render``
  without going through the database.
- MCP tools are forwarded; ``is_error`` is propagated back to the LLM
  as a ``tool_result.is_error=True`` block so the agent can self-correct.
- Safety nets: wall-clock timeout and a crashing body both fire
  ``agent_end`` with ``finish_reason="error:..."`` and do NOT broadcast
  ``work_order_ready`` (operator retries via the frontend).
- Datetime fields are parsed from ISO strings; malformed values are
  silently dropped (they are Optional on ``WorkOrderUpdate``).
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import pytest
from agents.work_order_generator import service as wog


# ---------------------------------------------------------------------------
# Anthropic + MCP + WS + DB fakes — same shape as the Investigator tests.
# ---------------------------------------------------------------------------


def _apply_dump_kwargs(
    data: dict[str, Any],
    *,
    exclude_none: bool = False,
    exclude: set[str] | None = None,
) -> dict[str, Any]:
    """Mimic ``pydantic.BaseModel.model_dump`` kwargs used by the agent loop."""
    if exclude_none:
        data = {k: v for k, v in data.items() if v is not None}
    if exclude:
        data = {k: v for k, v in data.items() if k not in exclude}
    return data


@dataclass
class _FakeTextBlock:
    text: str
    type: str = "text"
    # SDK v0.96.0 sets a client-only ``parsed_output`` on ``TextBlock`` for
    # structured outputs. It must NOT round-trip back into ``messages``.
    parsed_output: Any = None

    def model_dump(
        self,
        *,
        exclude_none: bool = False,
        exclude: set[str] | None = None,
    ) -> dict[str, Any]:
        return _apply_dump_kwargs(
            {"type": "text", "text": self.text, "parsed_output": self.parsed_output},
            exclude_none=exclude_none,
            exclude=exclude,
        )


@dataclass
class _FakeToolUseBlock:
    id: str
    name: str
    input: dict[str, Any]
    type: str = "tool_use"

    def model_dump(
        self,
        *,
        exclude_none: bool = False,
        exclude: set[str] | None = None,
    ) -> dict[str, Any]:
        return _apply_dump_kwargs(
            {"type": "tool_use", "id": self.id, "name": self.name, "input": self.input},
            exclude_none=exclude_none,
            exclude=exclude,
        )


@dataclass
class _FakeMessage:
    content: list[Any]
    stop_reason: str | None = "tool_use"


class _FakeAnthropic:
    def __init__(self, responses: list[_FakeMessage]) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []
        self.messages = self._Messages(self)

    class _Messages:
        def __init__(self, outer: "_FakeAnthropic") -> None:
            self._outer = outer

        async def create(self, **kwargs: Any) -> _FakeMessage:
            import copy

            self._outer.calls.append(copy.deepcopy(kwargs))
            if not self._outer.responses:
                raise AssertionError("No planned Anthropic response left")
            return self._outer.responses.pop(0)


@dataclass
class _ToolResult:
    content: str = "{}"
    is_error: bool = False


class _FakeMCP:
    def __init__(self, results: dict[str, _ToolResult] | None = None) -> None:
        self.results = results or {}
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def get_tools_schema(self) -> list[dict[str, Any]]:
        return []

    async def call_tool(self, name: str, args: dict[str, Any]) -> _ToolResult:
        self.calls.append((name, args))
        return self.results.get(name, _ToolResult(content="{}"))


class _FakeWS:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def broadcast(self, event_type: str, payload: dict[str, Any]) -> None:
        self.events.append((event_type, dict(payload)))


# ---------------------------------------------------------------------------
# DB fake
# ---------------------------------------------------------------------------


class _RepoSpy:
    def __init__(self) -> None:
        self.updates: list[tuple[int, dict[str, Any]]] = []


class _FakeWOR:
    def __init__(self, spy: _RepoSpy) -> None:
        self.spy = spy

    async def update(self, item_id: int, fields: dict[str, Any]):
        self.spy.updates.append((item_id, dict(fields)))
        return {"id": item_id, **fields}


@dataclass
class _FakePoolCtx:
    async def __aenter__(self) -> object:
        return object()

    async def __aexit__(self, *a: Any) -> None:
        return None


@dataclass
class _FakePool:
    def acquire(self) -> _FakePoolCtx:
        return _FakePoolCtx()


@dataclass
class _FakeDB:
    pool: _FakePool = field(default_factory=_FakePool)


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def patch_wog(monkeypatch: pytest.MonkeyPatch):
    """Inject fakes into ``work_order_generator`` module namespace."""

    def _install(
        *,
        responses: list[_FakeMessage],
        mcp_results: dict[str, _ToolResult] | None = None,
    ) -> tuple[_FakeAnthropic, _FakeMCP, _FakeWS, _RepoSpy]:
        spy = _RepoSpy()
        antr = _FakeAnthropic(responses=responses)
        mcp = _FakeMCP(results=mcp_results)
        ws = _FakeWS()
        monkeypatch.setattr(wog, "anthropic", antr)
        monkeypatch.setattr(wog, "mcp_client", mcp)
        monkeypatch.setattr(wog, "ws_manager", ws)
        monkeypatch.setattr(wog, "db", _FakeDB())
        monkeypatch.setattr(wog, "WorkOrderRepository", lambda _c: _FakeWOR(spy))
        monkeypatch.setattr(wog, "ToolUseBlock", _FakeToolUseBlock)
        return antr, mcp, ws, spy

    return _install


def _wo_loaded() -> dict[str, _ToolResult]:
    return {
        "get_work_order": _ToolResult(
            content=json.dumps(
                {
                    "cell_id": 2,
                    "title": "Anomaly on P-02",
                    "rca_summary": "Bearing wear; replace impeller bearing.",
                }
            )
        ),
    }


def _full_submit_args() -> dict[str, Any]:
    return {
        "title": "Replace impeller bearing on P-02",
        "description": "Planned replacement of the discharge impeller bearing.",
        "recommended_actions": [
            "Isolate and lock-out pump P-02",
            "Drain discharge line to the recovery tank",
            "Remove impeller cover (8 x M10 bolts, 35 Nm)",
            "Extract bearing with puller kit P-02A",
            "Install new SKF-6209-2Z with recommended grease",
            "Torque-sequence reassembly at 35 Nm",
            "Restart pump and verify vibration < 3.0 mm/s",
        ],
        "required_parts": [
            {"ref": "SKF-6209-2Z", "qty": 2},
            {"ref": "SHELL-GADUS-S2-V220", "qty": 1},
        ],
        "priority": "high",
        "estimated_duration_min": 180,
        "suggested_window_start": "2026-04-25T08:00:00+00:00",
        "suggested_window_end": "2026-04-25T12:00:00+00:00",
    }


# ---------------------------------------------------------------------------
# Tests — happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_updates_wo_and_broadcasts_ready(patch_wog) -> None:
    """submit_work_order → UPDATE with all fields + status='open' + work_order_ready."""
    submit_block = _FakeToolUseBlock(id="tu_1", name="submit_work_order", input=_full_submit_args())
    responses = [_FakeMessage(content=[submit_block])]
    _antr, _mcp, ws, spy = patch_wog(responses=responses, mcp_results=_wo_loaded())

    await wog.run_work_order_generator(work_order_id=42)

    assert len(spy.updates) == 1
    wo_id, update = spy.updates[0]
    assert wo_id == 42
    # Acceptance: recommended_actions, required_parts, priority, suggested_window_* non-null + status='open'.
    assert update["status"] == "open"
    assert update["priority"] == "high"
    assert len(update["recommended_actions"]) == 7
    assert update["required_parts"] == [
        {"ref": "SKF-6209-2Z", "qty": 2},
        {"ref": "SHELL-GADUS-S2-V220", "qty": 1},
    ]
    assert isinstance(update["suggested_window_start"], datetime)
    assert isinstance(update["suggested_window_end"], datetime)

    types = [e[0] for e in ws.events]
    assert types[0] == "agent_start"
    assert "tool_call_started" in types
    assert "tool_call_completed" in types
    assert "work_order_ready" in types
    # agent_end must fire last, with finish_reason='submit_work_order'.
    assert types[-1] == "agent_end"
    assert ws.events[-1][1]["finish_reason"] == "submit_work_order"

    ready = next(e for e in ws.events if e[0] == "work_order_ready")[1]
    # EventBusMap.work_order_ready is just {work_order_id}. turn_id is injected
    # by ws_manager.broadcast from the ContextVar in production — the fake here
    # is deliberately dumb and preserves only what the caller passed.
    assert ready == {"work_order_id": 42}


@pytest.mark.asyncio
async def test_tool_call_events_carry_expected_fields(patch_wog) -> None:
    kb_call = _FakeToolUseBlock(id="tu_1", name="get_equipment_kb", input={"cell_id": 2})
    submit = _FakeToolUseBlock(id="tu_2", name="submit_work_order", input=_full_submit_args())
    responses = [
        _FakeMessage(content=[kb_call]),
        _FakeMessage(content=[submit]),
    ]
    mcp_results = {
        **_wo_loaded(),
        "get_equipment_kb": _ToolResult(content=json.dumps({"procedures": []})),
    }
    _, _, ws, _ = patch_wog(responses=responses, mcp_results=mcp_results)

    await wog.run_work_order_generator(work_order_id=42)

    started = [e for e in ws.events if e[0] == "tool_call_started"]
    completed = [e for e in ws.events if e[0] == "tool_call_completed"]
    # Two tool calls: get_equipment_kb + submit_work_order
    assert len(started) == 2
    assert len(completed) == 2
    for payload in [e[1] for e in started]:
        assert payload["agent"] == "work_order_generator"
        assert {"tool_name", "args", "turn_id"} <= payload.keys()
    for payload in [e[1] for e in completed]:
        assert payload["agent"] == "work_order_generator"
        assert isinstance(payload["duration_ms"], int)
        assert {"tool_name", "turn_id"} <= payload.keys()


@pytest.mark.asyncio
async def test_render_work_order_card_fans_out_ui_render(patch_wog) -> None:
    render = _FakeToolUseBlock(
        id="tu_1",
        name="render_work_order_card",
        input={"cell_id": 2, "work_order_id": 42, "printable": True},
    )
    submit = _FakeToolUseBlock(id="tu_2", name="submit_work_order", input=_full_submit_args())
    antr, _, ws, _ = patch_wog(
        responses=[_FakeMessage(content=[render]), _FakeMessage(content=[submit])],
        mcp_results=_wo_loaded(),
    )

    await wog.run_work_order_generator(work_order_id=42)

    ui = next(e for e in ws.events if e[0] == "ui_render")[1]
    assert ui["agent"] == "work_order_generator"
    assert ui["component"] == "work_order_card"
    assert ui["props"]["printable"] is True

    second_messages = antr.calls[1]["messages"]
    tool_result = second_messages[-1]["content"][0]
    assert tool_result["content"] == "rendered"
    assert tool_result["is_error"] is False


@pytest.mark.asyncio
async def test_mcp_is_error_forwarded_to_llm(patch_wog) -> None:
    broken = _FakeToolUseBlock(id="tu_1", name="get_equipment_kb", input={"cell_id": 2})
    submit = _FakeToolUseBlock(id="tu_2", name="submit_work_order", input=_full_submit_args())
    mcp_results = {
        **_wo_loaded(),
        "get_equipment_kb": _ToolResult(content="KB missing", is_error=True),
    }
    antr, _, _ws, spy = patch_wog(
        responses=[_FakeMessage(content=[broken]), _FakeMessage(content=[submit])],
        mcp_results=mcp_results,
    )

    await wog.run_work_order_generator(work_order_id=42)

    # is_error=True block handed back to the LLM, loop continues to submit_work_order.
    second_messages = antr.calls[1]["messages"]
    tool_result = second_messages[-1]["content"][0]
    assert tool_result["is_error"] is True
    assert "KB missing" in tool_result["content"]
    # WO still written despite the KB error recovery path.
    assert spy.updates[0][1]["status"] == "open"


# ---------------------------------------------------------------------------
# Datetime parsing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_malformed_window_dates_are_dropped(patch_wog) -> None:
    args = {
        **_full_submit_args(),
        "suggested_window_start": "not-a-date",
        "suggested_window_end": "",
    }
    submit = _FakeToolUseBlock(id="tu_1", name="submit_work_order", input=args)
    _, _, _, spy = patch_wog(responses=[_FakeMessage(content=[submit])], mcp_results=_wo_loaded())
    await wog.run_work_order_generator(work_order_id=42)

    update = spy.updates[0][1]
    # Silently dropped — Optional on WorkOrderUpdate.
    assert "suggested_window_start" not in update
    assert "suggested_window_end" not in update
    # Other required fields still present.
    assert update["status"] == "open"


def test_parse_dt_helper_handles_common_shapes() -> None:
    assert wog._parse_dt("2026-04-25T08:00:00+00:00").tzinfo is timezone.utc  # type: ignore[union-attr]
    assert wog._parse_dt("") is None
    assert wog._parse_dt(None) is None
    assert wog._parse_dt("not-a-date") is None
    assert wog._parse_dt(42) is None


# ---------------------------------------------------------------------------
# Fallback paths — no work_order_ready broadcast
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_timeout_emits_error_agent_end_and_no_work_order_ready(
    patch_wog, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def never_returning_body(*_a, **_kw) -> None:
        await asyncio.sleep(10)

    monkeypatch.setattr(wog, "_run_body", never_returning_body)
    monkeypatch.setattr(wog, "_TIMEOUT_SECONDS", 0.05)
    _, _, ws, spy = patch_wog(responses=[], mcp_results=_wo_loaded())

    await wog.run_work_order_generator(work_order_id=42)

    # No WO update happened and the frontend-facing completion frame was NOT emitted.
    assert spy.updates == []
    assert all(e[0] != "work_order_ready" for e in ws.events)
    end = next(e for e in ws.events if e[0] == "agent_end")[1]
    assert end["finish_reason"].startswith("error:")


@pytest.mark.asyncio
async def test_crash_emits_error_agent_end_and_no_work_order_ready(
    patch_wog, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def raising_body(*_a, **_kw) -> None:
        raise RuntimeError("unexpected")

    monkeypatch.setattr(wog, "_run_body", raising_body)
    _, _, ws, spy = patch_wog(responses=[], mcp_results=_wo_loaded())

    await wog.run_work_order_generator(work_order_id=42)

    assert spy.updates == []
    assert all(e[0] != "work_order_ready" for e in ws.events)
    end = next(e for e in ws.events if e[0] == "agent_end")[1]
    assert "RuntimeError" in end["finish_reason"]


@pytest.mark.asyncio
async def test_get_work_order_error_short_circuits_to_fail_end(patch_wog) -> None:
    mcp_results = {"get_work_order": _ToolResult(content="not found", is_error=True)}
    antr, _, ws, spy = patch_wog(responses=[], mcp_results=mcp_results)

    await wog.run_work_order_generator(work_order_id=999)

    assert antr.calls == []  # no LLM call
    assert spy.updates == []
    assert all(e[0] != "work_order_ready" for e in ws.events)


# ---------------------------------------------------------------------------
# Schema sanity
# ---------------------------------------------------------------------------


def test_submit_work_order_tool_shape() -> None:
    assert wog.SUBMIT_WORK_ORDER_TOOL["name"] == "submit_work_order"
    required = wog.SUBMIT_WORK_ORDER_TOOL["input_schema"]["required"]
    # Acceptance-critical fields that the DB contract needs.
    assert {"title", "recommended_actions", "required_parts", "priority"} <= set(required)
    props = wog.SUBMIT_WORK_ORDER_TOOL["input_schema"]["properties"]
    # Guard against the "parts_required" vs "required_parts" audit drift.
    assert "required_parts" in props
    assert "parts_required" not in props
    # Priority enum must match work_order.Priority Literal.
    assert set(props["priority"]["enum"]) == {"low", "medium", "high", "critical"}


# ---------------------------------------------------------------------------
# Regression — SDK v0.96.0 ``parsed_output`` must be stripped before
# re-POSTing the assistant turn to the API (audit #2 / post-M7.4 bundle).
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_assistant_roundtrip_strips_sdk_only_parsed_output(patch_wog) -> None:
    """Regression — pin PR #108's pattern on the Work Order Generator loop.

    The Anthropic SDK v0.96.0 sets a client-only ``parsed_output`` on
    ``TextBlock`` when structured outputs are used. Re-POSTing that
    field back to ``messages.create`` yields a 400 ``Extra inputs are
    not permitted``. The WO Gen loop round-trips its assistant content
    across turns, so the ``model_dump`` must use
    ``exclude_none=True, exclude={"parsed_output"}``.
    """
    kb_call = _FakeToolUseBlock(id="tu_1", name="get_equipment_kb", input={"cell_id": 2})
    prose = _FakeTextBlock(text="drafting...", parsed_output={"whatever": 1})
    submit = _FakeToolUseBlock(id="tu_2", name="submit_work_order", input=_full_submit_args())
    responses = [
        _FakeMessage(content=[prose, kb_call]),
        _FakeMessage(content=[submit]),
    ]
    mcp_results = {
        **_wo_loaded(),
        "get_equipment_kb": _ToolResult(content=json.dumps({"procedures": []})),
    }
    antr, _, _ws, _spy = patch_wog(responses=responses, mcp_results=mcp_results)

    await wog.run_work_order_generator(work_order_id=42)

    # Second LLM call is the re-POST carrying the assistant content from turn 1.
    second_messages = antr.calls[1]["messages"]
    assistant_msg = next(m for m in second_messages if m["role"] == "assistant")
    for block in assistant_msg["content"]:
        assert (
            "parsed_output" not in block
        ), "parsed_output must be stripped before round-tripping to the API"
