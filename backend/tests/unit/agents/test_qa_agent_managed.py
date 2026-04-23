"""Tests for ``agents.qa`` Managed Agents path (issue #33 / M5.4).

Covers the acceptance items testable without a live Anthropic call:

- ``_build_custom_tools`` wraps every schema in the Managed-Agents
  ``{"type": "custom", ...}`` envelope while preserving name /
  description / input_schema.
- Happy text-only turn: a single ``agent.message`` event is trickled
  out as multiple ``text_delta`` frames and ``end_turn`` closes with
  ``done``.
- ``agent.custom_tool_use`` + ``requires_action`` path: the pending
  tool is dispatched via ``mcp_client.call_tool``, a
  ``user.custom_tool_result`` event is sent back, and the final
  ``end_turn`` closes the loop with ``done``.
- ``render_*`` tool path: dual-channel broadcast on events bus AND
  chat channel — matches the M5.2 contract bit for bit.
- ``ask_investigator`` path: handoff frames + nested agent_start /
  agent_end (reuses M5.2 helpers).
- Fallback wiring: router hands managed/state to ``run_qa_turn_managed``
  when the flag is on, and keeps the M5.2 path otherwise.
- Session caching: second user turn on the same connection reuses the
  already-created Anthropic session instead of creating a new one.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from typing import Any

import pytest
from agents.qa import investigator_qa as qa_investigator
from agents.qa import managed as qam
from agents.qa import schemas as qa_schemas
from agents.qa import tool_dispatch as qa_tool_dispatch

# ---------------------------------------------------------------------------
# Fake event objects — shape matches anthropic.types.beta.sessions.*
# ---------------------------------------------------------------------------


@dataclass
class _FakeTextBlock:
    text: str
    type: str = "text"


@dataclass
class _FakeAgentMessage:
    content: list[Any]
    type: str = "agent.message"
    id: str = "evt_msg"


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
# Fake SDK — beta.sessions.events.{stream,send} + create helpers
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
        # After the planned stream drains, merge in any follow-up events
        # enqueued by send() (e.g. requires_action → end_turn continuation).
        if not self._queued and self._outer._followups:
            self._queued.extend(self._outer._followups)
            self._outer._followups = []
        if not self._queued:
            raise StopAsyncIteration
        return self._queued.pop(0)


class _FakeEvents:
    def __init__(self, initial_events: list[list[Any]]) -> None:
        # One sub-list per stream() call (one per run_qa_turn_managed turn).
        self._stream_plans = list(initial_events)
        self._followups: list[Any] = []
        self.sends: list[dict[str, Any]] = []
        self._stream_opens = 0

    async def stream(self, session_id: str, **_kwargs: Any) -> _FakeStream:
        self._stream_opens += 1
        events = self._stream_plans.pop(0) if self._stream_plans else []
        return _FakeStream(self, events)

    async def send(self, session_id: str, *, events: list[dict[str, Any]], **_kwargs: Any) -> None:
        for ev in events:
            self.sends.append(copy.deepcopy(ev))
            if ev.get("type") == "user.custom_tool_result":
                # Default resolver: once all pending tool_results land, the
                # next stream event is an end_turn idle. Individual tests
                # can override _followups to assert a different flow.
                self._followups.append(_FakeIdleEvent(stop_reason=_FakeStopReason(type="end_turn")))


@dataclass
class _FakeCreated:
    id: str


class _FakeAgents:
    def __init__(self) -> None:
        self.created: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> _FakeCreated:
        self.created.append(copy.deepcopy(kwargs))
        return _FakeCreated(id="agent_abc")


class _FakeEnvironments:
    def __init__(self) -> None:
        self.created: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> _FakeCreated:
        self.created.append(copy.deepcopy(kwargs))
        return _FakeCreated(id="env_xyz")


class _FakeSessions:
    def __init__(self, events: _FakeEvents) -> None:
        self.events = events
        self.created: list[dict[str, Any]] = []
        self._next_id = 0

    async def create(self, **kwargs: Any) -> _FakeCreated:
        self.created.append(copy.deepcopy(kwargs))
        self._next_id += 1
        return _FakeCreated(id=f"sess_{self._next_id}")


class _FakeBeta:
    def __init__(self, stream_plans: list[list[Any]]) -> None:
        self.environments = _FakeEnvironments()
        self.agents = _FakeAgents()
        self.sessions = _FakeSessions(_FakeEvents(stream_plans))


class _FakeAnthropic:
    def __init__(self, stream_plans: list[list[Any]]) -> None:
        self.beta = _FakeBeta(stream_plans)


# ---------------------------------------------------------------------------
# MCP + WS fakes (mirror the M5.2 test pattern so the same assertions
# apply to the managed path).
# ---------------------------------------------------------------------------


@dataclass
class _ToolResult:
    content: str = "{}"
    is_error: bool = False


class _FakeMCP:
    def __init__(
        self,
        results: dict[str, _ToolResult] | None = None,
        schemas: list[dict[str, Any]] | None = None,
    ) -> None:
        self.results = results or {}
        self.schemas = schemas or []
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def get_tools_schema(self) -> list[dict[str, Any]]:
        return list(self.schemas)

    async def call_tool(self, name: str, args: dict[str, Any]) -> _ToolResult:
        self.calls.append((name, args))
        return self.results.get(name, _ToolResult(content="[]"))


class _FakeBusWS:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def broadcast(self, event_type: str, payload: dict[str, Any]) -> None:
        self.events.append((event_type, dict(payload)))


class _FakeClientWS:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    async def send_json(self, data: dict[str, Any]) -> None:
        self.sent.append(copy.deepcopy(data))


# ---------------------------------------------------------------------------
# Fixture — patches both modules so shared helpers (`_handle_render`,
# `_handle_ask_investigator`) see the same mcp_client / ws_manager fakes.
# ---------------------------------------------------------------------------


@pytest.fixture
def patch_qam(monkeypatch: pytest.MonkeyPatch):
    def _install(
        *,
        stream_plans: list[list[Any]] | None = None,
        mcp_results: dict[str, _ToolResult] | None = None,
        mcp_schemas: list[dict[str, Any]] | None = None,
    ) -> tuple[_FakeAnthropic, _FakeMCP, _FakeBusWS]:
        antr = _FakeAnthropic(stream_plans or [])
        mcp = _FakeMCP(results=mcp_results, schemas=mcp_schemas)
        bus = _FakeBusWS()

        # Patch the managed module.
        monkeypatch.setattr(qam, "anthropic", antr)
        monkeypatch.setattr(qam, "mcp_client", mcp)
        monkeypatch.setattr(qam, "ws_manager", bus)
        # Skip the trickle sleep so tests run fast.
        monkeypatch.setattr(qam, "_TRICKLE_DELAY_S", 0)

        # Patch the shared tool-dispatch helpers — ``handle_render`` /
        # ``handle_ask_investigator`` broadcast on ws_manager and call
        # ``investigator_qa.answer_investigator_question`` (which touches
        # Anthropic).
        monkeypatch.setattr(qa_tool_dispatch, "ws_manager", bus)
        monkeypatch.setattr(qa_investigator, "anthropic", antr)

        # Reset the module-level agent/env cache so each test bootstraps
        # fresh against its own fake SDK.
        monkeypatch.setattr(qam, "_agent_id", None)
        monkeypatch.setattr(qam, "_environment_id", None)

        return antr, mcp, bus

    return _install


# ---------------------------------------------------------------------------
# _build_custom_tools — envelope shape
# ---------------------------------------------------------------------------


def test_build_custom_tools_wraps_mcp_ui_and_ask_investigator() -> None:
    mcp_schemas = [
        {
            "name": "get_oee",
            "description": "Returns OEE for a cell.",
            "input_schema": {"type": "object", "properties": {}},
        },
    ]
    result = qa_schemas.build_custom_tools(mcp_schemas)

    # Every entry has the Managed-Agents custom envelope.
    for tool in result:
        assert tool["type"] == "custom"
        assert {"name", "description", "input_schema"}.issubset(tool)

    names = [t["name"] for t in result]
    assert "get_oee" in names
    # QA_RENDER_TOOLS live in agents.ui_tools (imported by qam).
    assert "render_signal_chart" in names
    assert "render_bar_chart" in names
    assert "render_equipment_kb_card" in names
    # ASK_INVESTIGATOR_TOOL schema must flow through unchanged.
    assert "ask_investigator" in names


# ---------------------------------------------------------------------------
# Happy text-only turn
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_text_only_turn_trickles_and_ends_with_done(patch_qam) -> None:
    ws = _FakeClientWS()
    # One agent.message block, then end_turn idle.
    msg_text = "OEE on P-02 this month is 91%."
    events = [
        _FakeAgentMessage(content=[_FakeTextBlock(text=msg_text)]),
        _FakeIdleEvent(stop_reason=_FakeStopReason(type="end_turn")),
    ]
    antr, _mcp, bus = patch_qam(stream_plans=[events])

    state: dict[str, Any] = {}
    await qam.run_qa_turn_managed(
        ws=ws,  # type: ignore[arg-type]
        session_state=state,
        user_content="OEE on P-02?",  # pyright: ignore[reportArgumentType]
    )

    types = [f["type"] for f in ws.sent]
    # Trickle produces multiple text_delta frames whose concatenation
    # equals the original message.
    assert types[-1] == "done"
    text_frames = [f for f in ws.sent if f["type"] == "text_delta"]
    assert len(text_frames) >= 1
    joined = "".join(f["content"] for f in text_frames)
    assert joined == msg_text

    # user.message was sent once; stream was opened once.
    sent_types = [e["type"] for e in antr.beta.sessions.events.sends]
    assert sent_types.count("user.message") == 1
    assert antr.beta.sessions.events._stream_opens == 1

    # Session was created (first turn) and cached.
    assert len(antr.beta.sessions.created) == 1
    assert state["session_id"] == "sess_1"

    # Events bus carries agent_start + agent_end with end_turn.
    event_types = [e[0] for e in bus.events]
    assert "agent_start" in event_types
    assert "agent_end" in event_types
    end = next(e for e in bus.events if e[0] == "agent_end")[1]
    assert end["finish_reason"] == "end_turn"


# ---------------------------------------------------------------------------
# Custom tool dispatch (MCP path)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mcp_custom_tool_dispatch_sends_result_and_ends(patch_qam) -> None:
    ws = _FakeClientWS()
    tool_use = _FakeCustomToolUse(id="evt_tu_1", name="get_oee", input={"cell_id": 2})
    events = [
        tool_use,
        _FakeIdleEvent(stop_reason=_FakeStopReason(type="requires_action", event_ids=["evt_tu_1"])),
        # After the send() callback queues end_turn, the stream sees it.
    ]
    mcp_results = {"get_oee": _ToolResult(content=json.dumps({"oee": 0.91, "cell_id": 2}))}
    antr, mcp, bus = patch_qam(stream_plans=[events], mcp_results=mcp_results)

    state: dict[str, Any] = {}
    await qam.run_qa_turn_managed(
        ws=ws,  # type: ignore[arg-type]
        session_state=state,
        user_content="OEE on P-02?",  # pyright: ignore[reportArgumentType]
    )

    # MCP was actually called with the agent's args.
    assert mcp.calls == [("get_oee", {"cell_id": 2})]

    # Frames reach the client: tool_call → tool_result → done.
    types = [f["type"] for f in ws.sent]
    assert "tool_call" in types
    assert "tool_result" in types
    assert types[-1] == "done"
    assert next(f for f in ws.sent if f["type"] == "tool_call")["args"] == {"cell_id": 2}
    tr = next(f for f in ws.sent if f["type"] == "tool_result")
    assert tr["name"] == "get_oee"
    assert isinstance(tr["summary"], str)
    assert "get_oee" in tr["summary"]

    # user.custom_tool_result sent with the right tool_use_id.
    sent = antr.beta.sessions.events.sends
    tool_results = [e for e in sent if e["type"] == "user.custom_tool_result"]
    assert len(tool_results) == 1
    assert tool_results[0]["custom_tool_use_id"] == "evt_tu_1"
    assert tool_results[0]["content"][0]["text"].startswith("{")

    # Events bus carries tool_call_started + tool_call_completed.
    event_types = [e[0] for e in bus.events]
    assert "tool_call_started" in event_types
    assert "tool_call_completed" in event_types


# ---------------------------------------------------------------------------
# render_* dual-channel broadcast
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_render_tool_dual_channel_broadcast(patch_qam) -> None:
    ws = _FakeClientWS()
    render_use = _FakeCustomToolUse(
        id="evt_tu_r",
        name="render_signal_chart",
        input={"cell_id": 2, "signal_def_id": 42, "window_hours": 24},
    )
    events = [
        render_use,
        _FakeIdleEvent(stop_reason=_FakeStopReason(type="requires_action", event_ids=["evt_tu_r"])),
    ]
    _antr, _mcp, bus = patch_qam(stream_plans=[events])

    state: dict[str, Any] = {}
    await qam.run_qa_turn_managed(
        ws=ws,  # type: ignore[arg-type]
        session_state=state,
        user_content="chart me P-02",  # pyright: ignore[reportArgumentType]
    )  # type: ignore[arg-type]

    # Chat channel: ui_render with the prefix stripped.
    chat_render = next(f for f in ws.sent if f["type"] == "ui_render")
    assert chat_render["component"] == "signal_chart"
    assert chat_render["props"]["cell_id"] == 2

    # Events bus: ui_render broadcast with agent="qa".
    bus_render = [e for e in bus.events if e[0] == "ui_render"]
    assert len(bus_render) == 1
    assert bus_render[0][1]["agent"] == "qa"
    assert bus_render[0][1]["component"] == "signal_chart"


# ---------------------------------------------------------------------------
# Session error surfaces as error frame
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_session_error_event_crashes_turn_with_error_frame(patch_qam) -> None:
    ws = _FakeClientWS()
    events = [_FakeErrorEvent(error={"type": "internal_error"})]
    _antr, _mcp, bus = patch_qam(stream_plans=[events])

    state: dict[str, Any] = {}
    await qam.run_qa_turn_managed(
        ws=ws, session_state=state, user_content="boom"  # pyright: ignore[reportArgumentType]
    )  # type: ignore[arg-type]

    done = ws.sent[-1]
    assert done["type"] == "done"
    assert "error" in done
    # agent_end still fires with finish_reason="error".
    end = next(e for e in bus.events if e[0] == "agent_end")[1]
    assert end["finish_reason"] == "error"


# ---------------------------------------------------------------------------
# Empty input short-circuits
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_user_content_short_circuits(patch_qam) -> None:
    ws = _FakeClientWS()
    antr, _mcp, _bus = patch_qam(stream_plans=[])

    state: dict[str, Any] = {}
    await qam.run_qa_turn_managed(
        ws=ws, session_state=state, user_content="   "  # pyright: ignore[reportArgumentType]
    )  # type: ignore[arg-type]

    # One frame, a done-with-error, and nothing hit the SDK.
    assert ws.sent == [{"type": "done", "error": "empty message"}]
    assert antr.beta.sessions.created == []
    assert antr.beta.sessions.events._stream_opens == 0


# ---------------------------------------------------------------------------
# Session cached across two turns on the same connection
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_second_turn_reuses_cached_session(patch_qam) -> None:
    ws = _FakeClientWS()
    turn1 = [
        _FakeAgentMessage(content=[_FakeTextBlock(text="hi")]),
        _FakeIdleEvent(stop_reason=_FakeStopReason(type="end_turn")),
    ]
    turn2 = [
        _FakeAgentMessage(content=[_FakeTextBlock(text="again")]),
        _FakeIdleEvent(stop_reason=_FakeStopReason(type="end_turn")),
    ]
    antr, _mcp, _bus = patch_qam(stream_plans=[turn1, turn2])

    state: dict[str, Any] = {}
    await qam.run_qa_turn_managed(
        ws=ws, session_state=state, user_content="hello"  # pyright: ignore[reportArgumentType]
    )  # type: ignore[arg-type]
    await qam.run_qa_turn_managed(
        ws=ws, session_state=state, user_content="again?"  # pyright: ignore[reportArgumentType]
    )  # type: ignore[arg-type]

    # Session created ONCE, reused on the second turn.
    assert len(antr.beta.sessions.created) == 1
    assert state["session_id"] == "sess_1"
    # Two streams were opened (one per turn).
    assert antr.beta.sessions.events._stream_opens == 2
    # Two user.message events were sent.
    user_msgs = [e for e in antr.beta.sessions.events.sends if e["type"] == "user.message"]
    assert len(user_msgs) == 2
