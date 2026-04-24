"""Tests for ``agents.investigator.managed`` (issue #103 / M5.5).

Covers the acceptance items testable without a live Anthropic call,
live MCP, or live database:

- Happy path: ``agent.thinking`` event → ``thinking_delta`` broadcast;
  ``agent.custom_tool_use`` for ``submit_rca`` + ``requires_action`` →
  handler runs, WO updated, ``investigator_session_id`` persisted,
  Work Order Generator spawn fires, ``end_turn`` closes with
  ``finish_reason='submit_rca'``.
- ``render_*`` ``requires_action`` path: ``ui_render`` broadcast fires,
  handler returns ``('rendered', False)`` sent back as
  ``user.custom_tool_result``.
- ``ask_kb_builder`` ``requires_action`` path: ``agent_handoff`` +
  child ``agent_start`` / ``agent_end`` broadcasts fire via the existing
  handoff helper.
- ``session.error`` event: routes to ``fallback_rca`` —
  ``rca_summary`` and ``rca_ready`` still broadcast, no regression.
- ``get_work_order`` is_error on context load: fallback_rca fires,
  no session is created.
- Bootstrap refuses when ``ARIA_MCP_PUBLIC_URL`` is empty — the
  managed path requires hosted MCP.
- End of turn without ``submit_rca`` routes to fallback_rca.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from typing import Any

import pytest
from agents.investigator import handoff as inv_handoff
from agents.investigator import managed as inv_managed
from agents.investigator import service as inv_service
from agents.investigator.managed import bootstrap as inv_managed_bootstrap
from agents.investigator.managed import events as inv_managed_events
from agents.investigator.managed import service as inv_managed_service
from agents.investigator.managed import tool_dispatch as inv_managed_tool_dispatch

# ---------------------------------------------------------------------------
# Fake event objects — shape matches the anthropic Managed Agents SDK surface.
# ---------------------------------------------------------------------------


@dataclass
class _FakeThinkingEvent:
    thinking: str
    type: str = "agent.thinking"
    id: str = "evt_think"


@dataclass
class _FakeCustomToolUse:
    id: str
    name: str
    input: dict[str, Any]
    type: str = "agent.custom_tool_use"


@dataclass
class _FakeStopReason:
    type: str  # "end_turn" | "requires_action" | "retries_exhausted"
    event_ids: list[str] = field(default_factory=list)


@dataclass
class _FakeIdleEvent:
    stop_reason: _FakeStopReason
    type: str = "session.status_idle"
    id: str = "evt_idle"


@dataclass
class _FakeErrorEvent:
    error: Any
    type: str = "session.error"
    id: str = "evt_err"


# ---------------------------------------------------------------------------
# Fake SDK surface — beta.sessions.events.{stream,send} + create helpers.
# ---------------------------------------------------------------------------


class _FakeStream:
    def __init__(self, outer: "_FakeEvents", events: list[Any]) -> None:
        self._outer = outer
        self._queued = list(events)

    async def __aenter__(self) -> "_FakeStream":
        return self

    async def __aexit__(self, *a: Any) -> None:
        return None

    def __aiter__(self) -> "_FakeStream":
        return self

    async def __anext__(self) -> Any:
        # Any events enqueued by send() during dispatch (e.g. an idle
        # end_turn follow-up) get appended after the planned stream drains.
        if not self._queued and self._outer._followups:
            self._queued.extend(self._outer._followups)
            self._outer._followups = []
        if not self._queued:
            raise StopAsyncIteration
        return self._queued.pop(0)


class _FakeEvents:
    def __init__(self, initial_events: list[list[Any]]) -> None:
        # One sub-list per stream() call (one per run_investigator_managed run).
        self._stream_plans = list(initial_events)
        self._followups: list[Any] = []
        self.sends: list[dict[str, Any]] = []
        self._stream_opens = 0
        # Default behavior: after all pending tool_result events have been
        # sent, enqueue an idle end_turn so the loop terminates.
        self._auto_end_turn_after_tool_results = True

    async def stream(self, session_id: str, **_kwargs: Any) -> _FakeStream:
        self._stream_opens += 1
        events = self._stream_plans.pop(0) if self._stream_plans else []
        return _FakeStream(self, events)

    async def send(self, session_id: str, *, events: list[dict[str, Any]], **_kwargs: Any) -> None:
        for ev in events:
            self.sends.append(copy.deepcopy(ev))
            if (
                self._auto_end_turn_after_tool_results
                and ev.get("type") == "user.custom_tool_result"
            ):
                self._followups.append(_FakeIdleEvent(stop_reason=_FakeStopReason(type="end_turn")))


@dataclass
class _FakeCreated:
    id: str


class _FakeAgents:
    def __init__(self) -> None:
        self.created: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> _FakeCreated:
        self.created.append(copy.deepcopy(kwargs))
        return _FakeCreated(id="agent_inv_abc")


class _FakeEnvironments:
    def __init__(self) -> None:
        self.created: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> _FakeCreated:
        self.created.append(copy.deepcopy(kwargs))
        return _FakeCreated(id="env_inv_xyz")


class _FakeSessions:
    def __init__(self, events: _FakeEvents) -> None:
        self.events = events
        self.created: list[dict[str, Any]] = []
        self._next_id = 0

    async def create(self, **kwargs: Any) -> _FakeCreated:
        self.created.append(copy.deepcopy(kwargs))
        self._next_id += 1
        return _FakeCreated(id=f"sess_inv_{self._next_id}")


class _FakeBeta:
    def __init__(self, stream_plans: list[list[Any]]) -> None:
        self.environments = _FakeEnvironments()
        self.agents = _FakeAgents()
        self.sessions = _FakeSessions(_FakeEvents(stream_plans))


class _FakeAnthropic:
    def __init__(self, stream_plans: list[list[Any]]) -> None:
        self.beta = _FakeBeta(stream_plans)


# ---------------------------------------------------------------------------
# MCP / WS / DB fakes (mirror the M4.5 investigator tests so behaviour
# comparisons across paths stay straightforward).
# ---------------------------------------------------------------------------


@dataclass
class _ToolResult:
    content: str = "{}"
    is_error: bool = False


class _FakeMCP:
    def __init__(self, results: dict[str, _ToolResult] | None = None) -> None:
        self.results = results or {}
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def call_tool(self, name: str, args: dict[str, Any]) -> _ToolResult:
        self.calls.append((name, args))
        return self.results.get(name, _ToolResult(content="[]"))


class _FakeBusWS:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def broadcast(self, event_type: str, payload: dict[str, Any]) -> None:
        self.events.append((event_type, dict(payload)))


# ---------------------------------------------------------------------------
# DB fake — captures WorkOrderRepository.update + KbRepository.create_failure.
# ---------------------------------------------------------------------------


class _FakeRepoSpy:
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


def _wo_loaded() -> dict[str, _ToolResult]:
    return {
        "get_work_order": _ToolResult(
            content=json.dumps({"cell_id": 2, "title": "Anomaly on P-02"})
        ),
        "get_failure_history": _ToolResult(content="[]"),
    }


@pytest.fixture
def patch_managed(monkeypatch: pytest.MonkeyPatch):
    """Install fakes across managed + service + handoff namespaces.

    The managed driver calls into ``service.handle_render`` /
    ``service.handle_submit_rca`` / ``handoff.handle_ask_kb_builder``
    for custom-tool dispatch, so ws_manager has to be faked on all three
    modules for broadcasts to be captured.
    """

    def _install(
        *,
        stream_plans: list[list[Any]] | None = None,
        mcp_results: dict[str, _ToolResult] | None = None,
        public_url: str = "https://tunnel.example.com/mcp/secret/",
        spawn_wog: bool = False,
    ) -> tuple[_FakeAnthropic, _FakeMCP, _FakeBusWS, _FakeRepoSpy]:
        spy = _FakeRepoSpy()
        antr = _FakeAnthropic(stream_plans or [])
        mcp = _FakeMCP(results=mcp_results or _wo_loaded())
        bus = _FakeBusWS()

        # Patch the managed subpackage — each submodule imports its own
        # ``anthropic`` / ``mcp_client`` / ``ws_manager``, so monkeypatching
        # at the package level wouldn't reach them.
        monkeypatch.setattr(inv_managed_bootstrap, "anthropic", antr)
        monkeypatch.setattr(inv_managed_events, "anthropic", antr)
        monkeypatch.setattr(inv_managed_events, "ws_manager", bus)
        monkeypatch.setattr(inv_managed_tool_dispatch, "anthropic", antr)
        monkeypatch.setattr(inv_managed_tool_dispatch, "ws_manager", bus)
        monkeypatch.setattr(inv_managed_service, "mcp_client", mcp)
        monkeypatch.setattr(inv_managed_service, "ws_manager", bus)
        # Reset the process-wide bootstrap cache so each test bootstraps
        # fresh against its own fake SDK.
        monkeypatch.setattr(inv_managed_bootstrap, "_agent_id", None)
        monkeypatch.setattr(inv_managed_bootstrap, "_environment_id", None)

        # Patch service helpers (handle_submit_rca + handle_render + fallback_rca).
        monkeypatch.setattr(inv_service, "ws_manager", bus)
        monkeypatch.setattr(inv_service, "db", _FakeDB())
        monkeypatch.setattr(inv_service, "WorkOrderRepository", lambda _c: _FakeWOR(spy))
        monkeypatch.setattr(inv_service, "KbRepository", lambda _c: _FakeKBR(spy))

        # Patch handoff (ws_manager + spawn — skip Work Order Generator in tests).
        monkeypatch.setattr(inv_handoff, "ws_manager", bus)
        if not spawn_wog:
            monkeypatch.setattr(inv_handoff, "spawn_work_order_generator", lambda _wo_id: None)

        # Ensure the public URL is configured so bootstrap does not refuse.
        monkeypatch.setenv("ARIA_MCP_PUBLIC_URL", public_url)
        # Fresh settings cache so env changes take effect.
        from core.config import get_settings

        get_settings.cache_clear()

        return antr, mcp, bus, spy

    return _install


# ---------------------------------------------------------------------------
# Happy path: thinking + submit_rca + session_id persistence + finish reason
# ---------------------------------------------------------------------------


def _submit_rca_input() -> dict[str, Any]:
    return {
        "root_cause": "Bearing wear near end-of-life",
        "failure_mode": "bearing_wear",
        "confidence": 0.82,
        "contributing_factors": ["vibration peak sustained", "MTBF threshold reached"],
        "similar_past_failure": None,
        "recommended_action": "Schedule bearing replacement in next 72h",
    }


@pytest.mark.asyncio
async def test_happy_path_submit_rca_persists_session_and_broadcasts(patch_managed) -> None:
    """agent.thinking → thinking_delta; submit_rca → WO update with session_id."""
    think = _FakeThinkingEvent(thinking="The vibration peak suggests bearing wear.")
    submit = _FakeCustomToolUse(
        id="evt_tu_submit",
        name="submit_rca",
        input=_submit_rca_input(),
    )
    events = [
        think,
        submit,
        _FakeIdleEvent(
            stop_reason=_FakeStopReason(type="requires_action", event_ids=["evt_tu_submit"])
        ),
        # _FakeEvents.send() will append an end_turn idle after the
        # tool_result, closing the loop.
    ]
    antr, _mcp, bus, spy = patch_managed(stream_plans=[events])

    await inv_managed.run_investigator_managed(work_order_id=42)

    # thinking_delta broadcast with the documented EventBusMap shape.
    thinks = [e for e in bus.events if e[0] == "thinking_delta"]
    assert len(thinks) == 1
    assert thinks[0][1]["agent"] == "investigator"
    assert thinks[0][1]["content"].startswith("The vibration peak")
    assert "turn_id" in thinks[0][1]

    # submit_rca side-effects (WO update + failure_history insert).
    assert len(spy.wo_updates) == 1
    wo_id, update = spy.wo_updates[0]
    assert wo_id == 42
    assert update["status"] == "analyzed"
    assert update["rca_summary"] == "Bearing wear near end-of-life"
    # Session id persisted for M5.6 reopen.
    assert update["investigator_session_id"] == "sess_inv_1"

    assert len(spy.fh_inserts) == 1
    assert spy.fh_inserts[0]["cell_id"] == 2
    assert spy.fh_inserts[0]["failure_mode"] == "bearing_wear"
    assert spy.fh_inserts[0]["work_order_id"] == 42

    # rca_ready broadcast with the documented shape.
    rca = next(e for e in bus.events if e[0] == "rca_ready")[1]
    assert rca["work_order_id"] == 42
    assert rca["confidence"] == pytest.approx(0.82)

    # agent_end fires with finish_reason='submit_rca'.
    end = next(e for e in bus.events if e[0] == "agent_end")[1]
    assert end["agent"] == "investigator"
    assert end["finish_reason"] == "submit_rca"

    # user.custom_tool_result sent back for the submit_rca event id.
    sent = antr.beta.sessions.events.sends
    tool_results = [e for e in sent if e.get("type") == "user.custom_tool_result"]
    assert len(tool_results) == 1
    assert tool_results[0]["custom_tool_use_id"] == "evt_tu_submit"
    assert tool_results[0]["is_error"] is False

    # Session + env + agent each created exactly once (process-wide cache).
    assert len(antr.beta.sessions.created) == 1
    assert len(antr.beta.environments.created) == 1
    assert len(antr.beta.agents.created) == 1


# ---------------------------------------------------------------------------
# render_* custom tool path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_render_custom_tool_fans_out_ui_render(patch_managed) -> None:
    render = _FakeCustomToolUse(
        id="evt_tu_render",
        name="render_signal_chart",
        input={"cell_id": 2, "signal_def_id": 10, "window_hours": 6},
    )
    submit = _FakeCustomToolUse(id="evt_tu_submit", name="submit_rca", input=_submit_rca_input())
    events = [
        render,
        _FakeIdleEvent(
            stop_reason=_FakeStopReason(type="requires_action", event_ids=["evt_tu_render"])
        ),
        submit,
        _FakeIdleEvent(
            stop_reason=_FakeStopReason(type="requires_action", event_ids=["evt_tu_submit"])
        ),
    ]
    _antr, _mcp, bus, _spy = patch_managed(stream_plans=[events])

    await inv_managed.run_investigator_managed(work_order_id=42)

    ui = next(e for e in bus.events if e[0] == "ui_render")[1]
    assert ui["agent"] == "investigator"
    assert ui["component"] == "signal_chart"
    assert ui["props"]["cell_id"] == 2


# ---------------------------------------------------------------------------
# ask_kb_builder handoff path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ask_kb_builder_emits_handoff_frames(
    patch_managed, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_answer(cell_id: int, question: str) -> dict[str, Any]:
        return {"answer": "Max torque 85 Nm", "source": "manual p12", "confidence": 0.9}

    import agents.kb_builder as kb_pkg

    monkeypatch.setattr(kb_pkg, "answer_kb_question", fake_answer, raising=False)

    ask = _FakeCustomToolUse(
        id="evt_tu_ask",
        name="ask_kb_builder",
        input={"cell_id": 2, "question": "Max torque on impeller bolt?"},
    )
    submit = _FakeCustomToolUse(id="evt_tu_submit", name="submit_rca", input=_submit_rca_input())
    events = [
        ask,
        _FakeIdleEvent(
            stop_reason=_FakeStopReason(type="requires_action", event_ids=["evt_tu_ask"])
        ),
        submit,
        _FakeIdleEvent(
            stop_reason=_FakeStopReason(type="requires_action", event_ids=["evt_tu_submit"])
        ),
    ]
    _antr, _mcp, bus, _spy = patch_managed(stream_plans=[events])

    await inv_managed.run_investigator_managed(work_order_id=42)

    ho = next(e for e in bus.events if e[0] == "agent_handoff")[1]
    assert ho["from_agent"] == "investigator"
    assert ho["to_agent"] == "kb_builder"

    kb_starts = [e for e in bus.events if e[0] == "agent_start" and e[1]["agent"] == "kb_builder"]
    kb_ends = [e for e in bus.events if e[0] == "agent_end" and e[1]["agent"] == "kb_builder"]
    assert len(kb_starts) == 1
    assert len(kb_ends) == 1


# ---------------------------------------------------------------------------
# Error / fallback paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_session_error_event_routes_to_fallback(patch_managed) -> None:
    """A session.error event surfaces as a fallback_rca with rca_ready."""
    err = _FakeErrorEvent(error={"type": "internal_error", "message": "boom"})
    _antr, _mcp, bus, spy = patch_managed(stream_plans=[[err]])

    await inv_managed.run_investigator_managed(work_order_id=42)

    # fallback_rca flipped the WO to analyzed with a reason string.
    assert len(spy.wo_updates) == 1
    wo_id, update = spy.wo_updates[0]
    assert wo_id == 42
    assert update["status"] == "analyzed"
    assert "Managed investigation failed" in update["rca_summary"]

    rca = next(e for e in bus.events if e[0] == "rca_ready")[1]
    assert rca["confidence"] == 0.0


@pytest.mark.asyncio
async def test_get_work_order_error_triggers_fallback_without_session(patch_managed) -> None:
    mcp_results = {
        "get_work_order": _ToolResult(content="not found", is_error=True),
        "get_failure_history": _ToolResult(content="[]"),
    }
    antr, _mcp, _bus, spy = patch_managed(stream_plans=[], mcp_results=mcp_results)

    await inv_managed.run_investigator_managed(work_order_id=999)

    # No Anthropic traffic at all — we never hit the bootstrap.
    assert antr.beta.sessions.created == []
    assert antr.beta.agents.created == []
    assert antr.beta.environments.created == []

    assert len(spy.wo_updates) == 1
    assert spy.wo_updates[0][1]["status"] == "analyzed"
    assert "get_work_order failed" in spy.wo_updates[0][1]["rca_summary"]


@pytest.mark.asyncio
async def test_end_turn_without_submit_rca_routes_to_fallback(patch_managed) -> None:
    """Agent ends without calling submit_rca — the WO must not stay in detected."""
    # Immediate end_turn idle, no custom_tool_use events.
    events = [_FakeIdleEvent(stop_reason=_FakeStopReason(type="end_turn"))]
    _antr, _mcp, _bus, spy = patch_managed(stream_plans=[events])

    await inv_managed.run_investigator_managed(work_order_id=42)

    # fallback_rca ran — WO is flipped.
    assert len(spy.wo_updates) == 1
    assert "ended without submitting" in spy.wo_updates[0][1]["rca_summary"]


# ---------------------------------------------------------------------------
# Bootstrap guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bootstrap_refuses_when_public_url_missing(patch_managed) -> None:
    """ARIA_MCP_PUBLIC_URL empty → refuse to bootstrap, route to fallback."""
    _antr, _mcp, _bus, spy = patch_managed(stream_plans=[[]], public_url="")

    await inv_managed.run_investigator_managed(work_order_id=42)

    # Bootstrap raises RuntimeError, outer try/except routes to fallback.
    assert len(spy.wo_updates) == 1
    assert "Managed investigation failed" in spy.wo_updates[0][1]["rca_summary"]


# ---------------------------------------------------------------------------
# Custom-tool envelope + hosted-MCP wiring — bootstrap assertions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bootstrap_registers_mcp_server_and_custom_tools(patch_managed) -> None:
    """Agent is created with mcp_servers=[...] (hosted MCP) and only 5 custom tools."""
    submit = _FakeCustomToolUse(id="evt_tu_submit", name="submit_rca", input=_submit_rca_input())
    events = [
        submit,
        _FakeIdleEvent(
            stop_reason=_FakeStopReason(type="requires_action", event_ids=["evt_tu_submit"])
        ),
    ]
    antr, _mcp, _bus, _spy = patch_managed(stream_plans=[events])

    await inv_managed.run_investigator_managed(work_order_id=42)

    agent_kwargs = antr.beta.agents.created[0]
    # Hosted MCP registered — no fallback to wrapping MCP tools as custom.
    assert agent_kwargs["mcp_servers"] == [
        {"type": "url", "name": "aria", "url": "https://tunnel.example.com/mcp/secret/"}
    ]

    # Only the custom escape-hatch tools: submit_rca + ask_kb_builder + 3 render_*.
    # (tools also contains mcp_toolset entries which have no "name" key)
    custom_tools = [t for t in agent_kwargs["tools"] if t["type"] == "custom"]
    tool_names = [t["name"] for t in custom_tools]
    assert set(tool_names) == {
        "submit_rca",
        "ask_kb_builder",
        "render_signal_chart",
        "render_diagnostic_card",
        "render_pattern_match",
        # M5.7 / #105 — the sandbox-execution visible-proof card, added to
        # INVESTIGATOR_RENDER_TOOLS so the managed agent can call it after
        # bash/Python diagnostics and before submit_rca.
        "render_sandbox_execution",
    }
    # mcp_toolset entries are present alongside the custom tools
    mcp_toolset_entries = [t for t in agent_kwargs["tools"] if t["type"] == "mcp_toolset"]
    assert len(mcp_toolset_entries) == len(agent_kwargs["mcp_servers"])
    assert len(mcp_toolset_entries) == len(agent_kwargs["mcp_servers"])
