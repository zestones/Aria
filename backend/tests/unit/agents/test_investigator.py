"""Tests for ``agents.investigator`` (issue #25 / M4.3).

Covers the acceptance items that are testable without a live Anthropic
call, live MCP, or live database:

- Investigator runs to completion and calls ``submit_rca``.
- ``work_order.rca_summary`` is populated (via repository mock).
- ``rca_ready`` WS event is broadcast with ``work_order_id``, ``rca_summary``,
  ``confidence``, ``turn_id``.
- ``tool_call_started`` + ``tool_call_completed`` are broadcast for each
  tool_use block (field shapes match ``EventBusMap``).
- ``is_error=True`` from an MCP tool is forwarded to the LLM, not raised.
- ``render_*`` tools fan out ``ui_render`` with component name stripped
  of the ``render_`` prefix.
- ``ask_kb_builder`` emits ``agent_handoff`` + child ``agent_start`` /
  ``agent_end`` around ``answer_kb_question``.
- Timeout and crash paths flip the WO to ``status='analyzed'`` with a
  fallback ``rca_summary`` and still broadcast ``rca_ready``.
- Work Order Generator spawn is a no-op INFO log when #30 is absent.
- `_handle_submit_rca` writes a ``failure_history`` row via
  ``KbRepository.create_failure``.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

import pytest
from agents.investigator import handoff as inv_handoff
from agents.investigator import service as inv

# ---------------------------------------------------------------------------
# Lightweight stand-ins for the Anthropic response shape.
# ---------------------------------------------------------------------------


@dataclass
class _FakeTextBlock:
    text: str
    type: str = "text"

    def model_dump(self) -> dict[str, Any]:
        return {"type": "text", "text": self.text}


@dataclass
class _FakeToolUseBlock:
    id: str
    name: str
    input: dict[str, Any]
    type: str = "tool_use"

    def model_dump(self) -> dict[str, Any]:
        return {"type": "tool_use", "id": self.id, "name": self.name, "input": self.input}


@dataclass
class _FakeMessage:
    content: list[Any]
    stop_reason: str | None = "tool_use"


# The investigator module imports ``ToolUseBlock`` from
# ``anthropic.types`` and uses ``isinstance`` against it. Our fake
# ToolUseBlock must therefore be recognised — patch the isinstance
# check via ``ToolUseBlock`` swap in module namespace.


class _FakeAnthropic:
    """Queue-backed fake exposing the same surface ``investigator._llm_call`` does.

    Each invocation pops the next planned message off ``self.responses`` and
    captures the kwargs in ``self.calls`` so tests can assert on what the
    agent loop sent (``messages``, ``tools``, etc.).

    The shape is intentionally the same as the previous ``messages.create``
    fake so the existing test assertions (``antr.calls[N]["messages"]``)
    keep working after the M4.5 streaming refactor.
    """

    def __init__(self, responses: list[_FakeMessage]) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    async def __call__(self, **kwargs: Any) -> _FakeMessage:
        import copy

        self.calls.append(copy.deepcopy(kwargs))
        if not self.responses:
            raise AssertionError("No planned LLM response left")
        return self.responses.pop(0)


@dataclass
class _ToolResult:
    content: str = "{}"
    is_error: bool = False


class _FakeMCP:
    def __init__(self, results: dict[str, _ToolResult] | None = None) -> None:
        self.results = results or {}
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._schema: list[dict[str, Any]] = []

    async def get_tools_schema(self) -> list[dict[str, Any]]:
        return self._schema

    async def call_tool(self, name: str, args: dict[str, Any]) -> _ToolResult:
        self.calls.append((name, args))
        return self.results.get(name, _ToolResult(content="[]"))


class _FakeWS:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def broadcast(self, event_type: str, payload: dict[str, Any]) -> None:
        self.events.append((event_type, dict(payload)))


# ---------------------------------------------------------------------------
# DB fake — same shape as the Sentinel test fake.
# ---------------------------------------------------------------------------


class _FakeRepoSpy:
    """Captures every WorkOrderRepository.update and KbRepository.create_failure call."""

    def __init__(self) -> None:
        self.wo_updates: list[tuple[int, dict[str, Any]]] = []
        self.fh_inserts: list[dict[str, Any]] = []


class _FakeWOR:
    def __init__(self, spy: _FakeRepoSpy) -> None:
        self.spy = spy

    async def update(self, item_id: int, fields: dict[str, Any]):
        self.spy.wo_updates.append((item_id, dict(fields)))
        return {"id": item_id, **fields}


class _FakeKBR:
    def __init__(self, spy: _FakeRepoSpy) -> None:
        self.spy = spy

    async def create_failure(self, fields: dict[str, Any]):
        self.spy.fh_inserts.append(dict(fields))
        return {"id": len(self.spy.fh_inserts)}


@dataclass
class _FakePoolCtx:
    async def __aenter__(self) -> object:
        return object()  # investigator never touches the conn directly

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
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def patch_inv(monkeypatch: pytest.MonkeyPatch):
    """Install a clean set of fakes in the ``investigator`` module namespace."""

    def _install(
        *,
        responses: list[_FakeMessage],
        mcp_results: dict[str, _ToolResult] | None = None,
    ) -> tuple[_FakeAnthropic, _FakeMCP, _FakeWS, _FakeRepoSpy]:
        spy = _FakeRepoSpy()
        antr = _FakeAnthropic(responses=responses)
        mcp = _FakeMCP(results=mcp_results)
        ws = _FakeWS()
        # M4.5 (#27): the loop now goes through ``_llm_call`` which wraps
        # ``anthropic.messages.stream(...)`` with extended thinking enabled.
        # Patch the helper directly so tests stay decoupled from the SDK
        # streaming surface.
        monkeypatch.setattr(inv, "_llm_call", antr)
        monkeypatch.setattr(inv, "mcp_client", mcp)
        monkeypatch.setattr(inv, "ws_manager", ws)
        monkeypatch.setattr(inv, "db", _FakeDB())
        monkeypatch.setattr(inv, "WorkOrderRepository", lambda _c: _FakeWOR(spy))
        monkeypatch.setattr(inv, "KbRepository", lambda _c: _FakeKBR(spy))
        # Swap ToolUseBlock so isinstance() recognises our fake blocks.
        monkeypatch.setattr(inv, "ToolUseBlock", _FakeToolUseBlock)
        # The handoff submodule broadcasts ``agent_handoff`` / ``agent_start``
        # / ``agent_end`` on its own ``ws_manager`` reference (M5.5 split).
        monkeypatch.setattr(inv_handoff, "ws_manager", ws)
        return antr, mcp, ws, spy

    return _install


def _wo_loaded() -> dict[str, _ToolResult]:
    return {
        "get_work_order": _ToolResult(
            content=json.dumps({"cell_id": 2, "title": "Anomaly on P-02"})
        ),
        "get_failure_history": _ToolResult(content="[]"),
    }


# ---------------------------------------------------------------------------
# Tests — happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_submit_rca_persists_and_broadcasts(patch_inv) -> None:
    """One turn: LLM calls submit_rca -> WO updated, failure_history written,
    rca_ready broadcast, loop exits with finish_reason='submit_rca'."""
    submit_block = _FakeToolUseBlock(
        id="tu_1",
        name="submit_rca",
        input={
            "root_cause": "Bearing wear near end-of-life",
            "failure_mode": "bearing_wear",
            "confidence": 0.82,
            "contributing_factors": ["vibration peak sustained", "MTBF threshold reached"],
            "similar_past_failure": None,
            "recommended_action": "Schedule bearing replacement in next 72h",
        },
    )
    responses = [_FakeMessage(content=[submit_block])]
    _antr, _mcp, ws, spy = patch_inv(responses=responses, mcp_results=_wo_loaded())

    await inv.run_investigator(work_order_id=42)

    # submit_rca side-effects
    assert spy.wo_updates == [
        (42, {"rca_summary": "Bearing wear near end-of-life", "status": "analyzed"})
    ]
    assert len(spy.fh_inserts) == 1
    fh = spy.fh_inserts[0]
    assert fh["cell_id"] == 2
    assert fh["failure_mode"] == "bearing_wear"
    assert fh["work_order_id"] == 42
    assert fh["root_cause"] == "Bearing wear near end-of-life"

    # Frame sequence
    types = [e[0] for e in ws.events]
    assert types[0] == "agent_start"
    assert "tool_call_started" in types
    assert "tool_call_completed" in types
    assert "rca_ready" in types
    assert types[-1] == "agent_end"

    rca_frame = next(e for e in ws.events if e[0] == "rca_ready")[1]
    assert rca_frame["work_order_id"] == 42
    assert rca_frame["rca_summary"] == "Bearing wear near end-of-life"
    assert rca_frame["confidence"] == pytest.approx(0.82)
    assert "turn_id" in rca_frame

    end_frame = ws.events[-1][1]
    assert end_frame["finish_reason"] == "submit_rca"


@pytest.mark.asyncio
async def test_tool_call_events_carry_expected_fields(patch_inv) -> None:
    """Each tool_use fires started + completed with the right field sets."""
    mcp_call = _FakeToolUseBlock(
        id="tu_1",
        name="get_current_signals",
        input={"cell_id": 2},
    )
    submit = _FakeToolUseBlock(
        id="tu_2",
        name="submit_rca",
        input={
            "root_cause": "x",
            "failure_mode": "x",
            "confidence": 0.5,
            "contributing_factors": [],
            "recommended_action": "x",
        },
    )
    responses = [
        _FakeMessage(content=[mcp_call]),
        _FakeMessage(content=[submit]),
    ]
    mcp_results = {
        **_wo_loaded(),
        "get_current_signals": _ToolResult(content=json.dumps([{"signal_def_id": 10}])),
    }
    _, _, ws, _ = patch_inv(responses=responses, mcp_results=mcp_results)

    await inv.run_investigator(work_order_id=42)

    started = [e for e in ws.events if e[0] == "tool_call_started"]
    completed = [e for e in ws.events if e[0] == "tool_call_completed"]
    assert len(started) == 2
    assert len(completed) == 2
    for payload in [e[1] for e in started]:
        assert {"agent", "tool_name", "args", "turn_id"} <= payload.keys()
        assert payload["agent"] == "investigator"
    for payload in [e[1] for e in completed]:
        assert {"agent", "tool_name", "duration_ms", "turn_id"} <= payload.keys()
        assert isinstance(payload["duration_ms"], int)


@pytest.mark.asyncio
async def test_is_error_tool_result_forwarded_not_raised(patch_inv) -> None:
    """An MCP tool returning is_error=True becomes a tool_result with
    is_error=True — the loop keeps going, the LLM can self-correct."""
    broken_call = _FakeToolUseBlock(id="tu_1", name="get_signal_anomalies", input={"cell_id": 2})
    submit = _FakeToolUseBlock(
        id="tu_2",
        name="submit_rca",
        input={
            "root_cause": "partial evidence",
            "failure_mode": "unknown",
            "confidence": 0.2,
            "contributing_factors": [],
            "recommended_action": "inspect",
        },
    )
    mcp_results = {
        **_wo_loaded(),
        "get_signal_anomalies": _ToolResult(content="KB misconfigured", is_error=True),
    }
    antr, _, _ws, spy = patch_inv(
        responses=[_FakeMessage(content=[broken_call]), _FakeMessage(content=[submit])],
        mcp_results=mcp_results,
    )

    await inv.run_investigator(work_order_id=42)

    # The second messages.create call must have received the is_error result.
    second_messages = antr.calls[1]["messages"]
    # last user message holds the tool_results
    last_user = second_messages[-1]
    tool_result = last_user["content"][0]
    assert tool_result["is_error"] is True
    assert "KB misconfigured" in tool_result["content"]

    # Loop did not die on the is_error, final WO update happened.
    assert spy.wo_updates[-1][1]["status"] == "analyzed"


@pytest.mark.asyncio
async def test_render_tool_fans_out_ui_render_and_returns_rendered(patch_inv) -> None:
    render = _FakeToolUseBlock(
        id="tu_1",
        name="render_signal_chart",
        input={"cell_id": 2, "signal_def_id": 10, "window_hours": 6},
    )
    submit = _FakeToolUseBlock(
        id="tu_2",
        name="submit_rca",
        input={
            "root_cause": "x",
            "failure_mode": "x",
            "confidence": 0.5,
            "contributing_factors": [],
            "recommended_action": "x",
        },
    )
    antr, _, ws, _ = patch_inv(
        responses=[_FakeMessage(content=[render]), _FakeMessage(content=[submit])],
        mcp_results=_wo_loaded(),
    )

    await inv.run_investigator(work_order_id=42)

    ui = next(e for e in ws.events if e[0] == "ui_render")[1]
    assert ui["agent"] == "investigator"
    assert ui["component"] == "signal_chart"  # "render_" prefix stripped
    assert ui["props"]["cell_id"] == 2

    second_messages = antr.calls[1]["messages"]
    tool_result = second_messages[-1]["content"][0]
    assert tool_result["content"] == "rendered"
    assert tool_result["is_error"] is False


# ---------------------------------------------------------------------------
# ask_kb_builder handoff
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ask_kb_builder_broadcasts_handoff_and_returns_answer(
    patch_inv, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_answer(cell_id: int, question: str) -> dict[str, Any]:
        return {"answer": "Max torque 85 Nm", "source": "manual p12", "confidence": 0.9}

    import agents.kb_builder as kb_pkg

    monkeypatch.setattr(kb_pkg, "answer_kb_question", fake_answer, raising=False)

    ask = _FakeToolUseBlock(
        id="tu_1",
        name="ask_kb_builder",
        input={"cell_id": 2, "question": "Max torque on impeller bolt?"},
    )
    submit = _FakeToolUseBlock(
        id="tu_2",
        name="submit_rca",
        input={
            "root_cause": "x",
            "failure_mode": "x",
            "confidence": 0.5,
            "contributing_factors": [],
            "recommended_action": "x",
        },
    )
    antr, _, ws, _ = patch_inv(
        responses=[_FakeMessage(content=[ask]), _FakeMessage(content=[submit])],
        mcp_results=_wo_loaded(),
    )

    await inv.run_investigator(work_order_id=42)

    ho = next(e for e in ws.events if e[0] == "agent_handoff")[1]
    assert ho["from_agent"] == "investigator"
    assert ho["to_agent"] == "kb_builder"
    assert ho["reason"] == "Max torque on impeller bolt?"

    kb_starts = [e for e in ws.events if e[0] == "agent_start" and e[1]["agent"] == "kb_builder"]
    kb_ends = [e for e in ws.events if e[0] == "agent_end" and e[1]["agent"] == "kb_builder"]
    assert len(kb_starts) == 1
    assert len(kb_ends) == 1
    assert kb_ends[0][1]["finish_reason"] == "answered"

    # The tool_result sent back to the LLM carries the JSON-encoded answer.
    second_messages = antr.calls[1]["messages"]
    tr = second_messages[-1]["content"][0]
    parsed = json.loads(tr["content"])
    assert parsed["answer"].startswith("Max torque")


# ---------------------------------------------------------------------------
# Fallback paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_timeout_fallback_flips_status_and_broadcasts_rca_ready(
    patch_inv, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def never_returning_body(*_a, **_kw) -> None:
        await asyncio.sleep(10)

    monkeypatch.setattr(inv, "_run_investigator_body", never_returning_body)
    monkeypatch.setattr(inv, "_TIMEOUT_SECONDS", 0.05)

    _, _, ws, spy = patch_inv(responses=[], mcp_results=_wo_loaded())

    await inv.run_investigator(work_order_id=42)

    assert spy.wo_updates == [
        (42, {"rca_summary": "Investigation timed out", "status": "analyzed"})
    ]
    rca = next(e for e in ws.events if e[0] == "rca_ready")[1]
    assert rca["confidence"] == 0.0
    assert rca["rca_summary"] == "Investigation timed out"


@pytest.mark.asyncio
async def test_crash_fallback_flips_status_and_broadcasts_rca_ready(
    patch_inv, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def raising_body(*_a, **_kw) -> None:
        raise RuntimeError("unexpected")

    monkeypatch.setattr(inv, "_run_investigator_body", raising_body)
    _, _, ws, spy = patch_inv(responses=[], mcp_results=_wo_loaded())

    await inv.run_investigator(work_order_id=42)

    assert spy.wo_updates == [
        (42, {"rca_summary": "Investigation failed: RuntimeError", "status": "analyzed"})
    ]
    rca = next(e for e in ws.events if e[0] == "rca_ready")[1]
    assert rca["confidence"] == 0.0
    assert "Investigation failed" in rca["rca_summary"]


@pytest.mark.asyncio
async def test_get_work_order_error_triggers_fallback(patch_inv) -> None:
    # get_work_order returns is_error=True -> fallback, no further API calls.
    mcp_results = {
        "get_work_order": _ToolResult(content="not found", is_error=True),
        "get_failure_history": _ToolResult(content="[]"),
    }
    antr, _, ws, spy = patch_inv(responses=[], mcp_results=mcp_results)

    await inv.run_investigator(work_order_id=999)

    assert antr.calls == []  # no LLM call attempted
    assert spy.wo_updates[0][1]["status"] == "analyzed"
    rca = next(e for e in ws.events if e[0] == "rca_ready")[1]
    assert "get_work_order failed" in rca["rca_summary"]


# ---------------------------------------------------------------------------
# Tool schema sanity — guards against future drift on the wire contract.
# ---------------------------------------------------------------------------


def test_submit_rca_tool_shape() -> None:
    assert inv.SUBMIT_RCA_TOOL["name"] == "submit_rca"
    required = inv.SUBMIT_RCA_TOOL["input_schema"]["required"]
    assert "failure_mode" in required
    assert "root_cause" in required
    assert "confidence" in required
    assert "recommended_action" in required
    props = inv.SUBMIT_RCA_TOOL["input_schema"]["properties"]
    assert props["failure_mode"]["maxLength"] == 100


def test_ask_kb_builder_tool_shape() -> None:
    assert inv.ASK_KB_BUILDER_TOOL["name"] == "ask_kb_builder"
    required = inv.ASK_KB_BUILDER_TOOL["input_schema"]["required"]
    assert {"question", "cell_id"} <= set(required)


# ---------------------------------------------------------------------------
# M4.5 (#27) — extended thinking + thinking_delta streaming
# ---------------------------------------------------------------------------


@dataclass
class _FakeStreamDelta:
    type: str
    thinking: str | None = None


@dataclass
class _FakeStreamEvent:
    type: str
    delta: _FakeStreamDelta | None = None


class _FakeMessagesStream:
    """Minimal async context manager mimicking ``anthropic.messages.stream``.

    Yields the planned ``MessageStreamEvent``-like objects from ``events``
    and returns ``final_message`` from ``get_final_message()``.
    """

    def __init__(self, events: list[_FakeStreamEvent], final_message: _FakeMessage) -> None:
        self._events = events
        self._final = final_message
        self.kwargs: dict[str, Any] = {}

    def __call__(self, **kwargs: Any) -> "_FakeMessagesStream":
        self.kwargs = kwargs
        return self

    async def __aenter__(self) -> "_FakeMessagesStream":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        return None

    def __aiter__(self) -> "_FakeMessagesStream":
        self._iter = iter(self._events)
        return self

    async def __anext__(self) -> _FakeStreamEvent:
        try:
            return next(self._iter)
        except StopIteration as e:
            raise StopAsyncIteration from e

    async def get_final_message(self) -> _FakeMessage:
        return self._final


@pytest.mark.asyncio
async def test_llm_call_enables_thinking_and_streams_thinking_delta(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Acceptance #1 — `thinking_delta` events streamed during a turn.

    Verifies that ``_llm_call`` enables extended thinking, fans out each
    thinking chunk through ``ws_manager.broadcast`` with the
    ``EventBusMap.thinking_delta`` shape, and returns the reconstructed
    final message verbatim.
    """
    submit_block = _FakeToolUseBlock(
        id="tu_x",
        name="submit_rca",
        input={
            "root_cause": "x",
            "failure_mode": "x",
            "confidence": 0.5,
            "contributing_factors": [],
            "recommended_action": "x",
        },
    )
    final = _FakeMessage(content=[submit_block], stop_reason="tool_use")
    events = [
        _FakeStreamEvent(type="message_start"),
        _FakeStreamEvent(type="content_block_start"),
        _FakeStreamEvent(
            type="content_block_delta",
            delta=_FakeStreamDelta(type="thinking_delta", thinking="The vibration "),
        ),
        _FakeStreamEvent(
            type="content_block_delta",
            delta=_FakeStreamDelta(type="thinking_delta", thinking="peak suggests bearing wear."),
        ),
        # Non-thinking deltas must NOT trigger a broadcast.
        _FakeStreamEvent(
            type="content_block_delta",
            delta=_FakeStreamDelta(type="text_delta", thinking=None),
        ),
        _FakeStreamEvent(type="content_block_stop"),
        _FakeStreamEvent(type="message_stop"),
    ]
    stream = _FakeMessagesStream(events=events, final_message=final)

    class _AntStub:
        class messages:
            pass

    _AntStub.messages.stream = stream  # type: ignore[attr-defined]

    ws = _FakeWS()
    monkeypatch.setattr(inv, "anthropic", _AntStub)
    monkeypatch.setattr(inv, "ws_manager", ws)

    result = await inv._llm_call(
        system="sys",
        messages=[{"role": "user", "content": "hi"}],
        tools=[{"name": "noop"}],
        turn_id="turn-abc",
    )

    # Final message returned verbatim (signed-thinking-block preservation).
    assert result is final

    # Extended thinking enabled with the documented budget.
    assert stream.kwargs["thinking"] == {
        "type": "enabled",
        "budget_tokens": inv._THINKING_BUDGET,
    }
    # max_tokens leaves room above the thinking budget (Anthropic requires
    # max_tokens > thinking.budget_tokens).
    assert stream.kwargs["max_tokens"] > inv._THINKING_BUDGET

    # Exactly two thinking_delta frames broadcast — text_delta does NOT fan out.
    deltas = [(t, p) for t, p in ws.events if t == "thinking_delta"]
    assert len(deltas) == 2

    # Frame shape matches EventBusMap.thinking_delta in ws.types.ts.
    for _, payload in deltas:
        assert set(payload.keys()) == {"agent", "content", "turn_id"}
        assert payload["agent"] == "investigator"
        assert payload["turn_id"] == "turn-abc"
    assert deltas[0][1]["content"] == "The vibration "
    assert deltas[1][1]["content"] == "peak suggests bearing wear."


@pytest.mark.asyncio
async def test_llm_call_skips_empty_thinking_chunk(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Empty/None thinking chunks must not produce noisy frames."""
    final = _FakeMessage(content=[], stop_reason="end_turn")
    events = [
        _FakeStreamEvent(
            type="content_block_delta",
            delta=_FakeStreamDelta(type="thinking_delta", thinking=""),
        ),
        _FakeStreamEvent(
            type="content_block_delta",
            delta=_FakeStreamDelta(type="thinking_delta", thinking=None),
        ),
    ]
    stream = _FakeMessagesStream(events=events, final_message=final)

    class _AntStub:
        class messages:
            pass

    _AntStub.messages.stream = stream  # type: ignore[attr-defined]

    ws = _FakeWS()
    monkeypatch.setattr(inv, "anthropic", _AntStub)
    monkeypatch.setattr(inv, "ws_manager", ws)

    await inv._llm_call(system="s", messages=[], tools=[], turn_id="t")

    assert [t for t, _ in ws.events if t == "thinking_delta"] == []
