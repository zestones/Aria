"""Tests for ``agents.qa_agent`` (issue #31 / M5.2).

Covers the acceptance items that are testable without a live Anthropic
call, live MCP, or live database:

- Happy text-only turn: stream ``text_delta`` chunks, terminate with ``done``.
- Tool call path: stream ``tool_call``, call MCP, stream ``tool_result``
  with a short ``summary`` string (not raw JSON).
- ``render_*`` tool: dual-channel broadcast — events bus ``ui_render`` AND
  chat channel ``ui_render`` with the ``render_`` prefix stripped.
- ``ask_investigator`` handoff: dual-channel ``agent_handoff``, child
  ``agent_start``/``agent_end``, returns the ``answer_investigator_question``
  JSON as the tool_result content.
- ``is_error=True`` from an MCP tool is forwarded to the LLM and produces
  a "{tool} failed" summary to the client.
- Summary helper handles list/dict/string/error content.
- Agent-end is broadcast (to the events bus) even when the turn crashes;
  the client receives ``done`` with an ``error`` field.
- ``ASK_INVESTIGATOR_TOOL`` schema is drift-free.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from typing import Any

import pytest
from agents import qa_agent as qa


# ---------------------------------------------------------------------------
# Fake blocks / message / stream
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
class _FakeEvent:
    """Emulates ``content_block_delta`` with ``text_delta`` sub-shape."""

    type: str
    delta: Any


@dataclass
class _FakeDelta:
    type: str
    text: str


@dataclass
class _FakeFinalMessage:
    content: list[Any]
    stop_reason: str = "end_turn"


class _FakeStream:
    """Async context manager yielding events, then returning a final message."""

    def __init__(self, *, deltas: list[str], final_content: list[Any]) -> None:
        self._deltas = deltas
        self._final = _FakeFinalMessage(content=final_content)

    async def __aenter__(self) -> "_FakeStream":
        return self

    async def __aexit__(self, *a: Any) -> None:
        return None

    def __aiter__(self) -> "_FakeStream":
        self._i = iter(
            _FakeEvent(
                type="content_block_delta",
                delta=_FakeDelta(type="text_delta", text=chunk),
            )
            for chunk in self._deltas
        )
        return self

    async def __anext__(self) -> _FakeEvent:
        try:
            return next(self._i)
        except StopIteration:
            raise StopAsyncIteration

    async def get_final_message(self) -> _FakeFinalMessage:
        return self._final


class _FakeAnthropic:
    """Queue-backed fake exposing ``messages.stream`` + ``messages.create``."""

    def __init__(
        self,
        *,
        stream_plans: list[tuple[list[str], list[Any]]] | None = None,
        create_responses: list[_FakeFinalMessage] | None = None,
    ) -> None:
        self._stream_plans = list(stream_plans or [])
        self._create_responses = list(create_responses or [])
        self.stream_calls: list[dict[str, Any]] = []
        self.create_calls: list[dict[str, Any]] = []
        self.messages = self._Messages(self)

    class _Messages:
        def __init__(self, outer: "_FakeAnthropic") -> None:
            self._outer = outer

        def stream(self, **kwargs: Any) -> _FakeStream:
            self._outer.stream_calls.append(copy.deepcopy(kwargs))
            if not self._outer._stream_plans:
                raise AssertionError("No planned stream response left")
            deltas, final_content = self._outer._stream_plans.pop(0)
            return _FakeStream(deltas=deltas, final_content=final_content)

        async def create(self, **kwargs: Any) -> _FakeFinalMessage:
            self._outer.create_calls.append(copy.deepcopy(kwargs))
            if not self._outer._create_responses:
                raise AssertionError("No planned create response left")
            return self._outer._create_responses.pop(0)


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
        return self.results.get(name, _ToolResult(content="[]"))


class _FakeBusWS:
    """Events-bus ``ws_manager`` fake — same shape as earlier agent tests."""

    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def broadcast(self, event_type: str, payload: dict[str, Any]) -> None:
        self.events.append((event_type, dict(payload)))


class _FakeClientWS:
    """Chat-channel ``WebSocket`` fake — only ``send_json`` used."""

    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    async def send_json(self, data: dict[str, Any]) -> None:
        self.sent.append(copy.deepcopy(data))


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def patch_qa(monkeypatch: pytest.MonkeyPatch):
    def _install(
        *,
        stream_plans: list[tuple[list[str], list[Any]]] | None = None,
        mcp_results: dict[str, _ToolResult] | None = None,
    ) -> tuple[_FakeAnthropic, _FakeMCP, _FakeBusWS]:
        antr = _FakeAnthropic(stream_plans=stream_plans)
        mcp = _FakeMCP(results=mcp_results)
        bus = _FakeBusWS()
        monkeypatch.setattr(qa, "anthropic", antr)
        monkeypatch.setattr(qa, "mcp_client", mcp)
        monkeypatch.setattr(qa, "ws_manager", bus)
        # Swap ToolUseBlock so isinstance() recognises our fakes.
        monkeypatch.setattr(qa, "ToolUseBlock", _FakeToolUseBlock)
        return antr, mcp, bus

    return _install


# ---------------------------------------------------------------------------
# Happy text-only path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_text_only_turn_streams_deltas_and_ends_with_done(patch_qa) -> None:
    ws = _FakeClientWS()
    deltas = ["OEE on P-02 ", "this month is ", "91%."]
    final_content: list[Any] = [_FakeTextBlock(text="OEE on P-02 this month is 91%.")]
    _antr, _mcp, bus = patch_qa(stream_plans=[(deltas, final_content)])

    messages: list[dict[str, Any]] = []
    await qa.run_qa_turn(ws=ws, messages=messages, user_content="OEE on P-02?")  # type: ignore[arg-type]

    # Client stream: 3 text_delta + 1 done
    types = [f["type"] for f in ws.sent]
    assert types == ["text_delta", "text_delta", "text_delta", "done"]
    assert ws.sent[0]["content"] == "OEE on P-02 "
    assert ws.sent[-1] == {"type": "done"}

    # messages holds: user + assistant (content blocks).
    assert len(messages) == 2
    assert messages[0] == {"role": "user", "content": "OEE on P-02?"}
    assert messages[1]["role"] == "assistant"

    # Events bus carries agent_start / agent_end.
    event_types = [e[0] for e in bus.events]
    assert "agent_start" in event_types
    assert "agent_end" in event_types
    end = next(e for e in bus.events if e[0] == "agent_end")[1]
    assert end["finish_reason"] == "end_turn"


# ---------------------------------------------------------------------------
# MCP tool call path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mcp_tool_call_streams_tool_call_and_result_summary(patch_qa) -> None:
    get_oee = _FakeToolUseBlock(id="tu_1", name="get_oee", input={"cell_id": 2})
    ws = _FakeClientWS()

    # Turn 1: empty text, one tool_use. Turn 2: final text, no tool_use.
    stream_plans = [
        ([], [get_oee]),
        (["OEE on P-02 is 91%."], [_FakeTextBlock(text="OEE on P-02 is 91%.")]),
    ]
    mcp_results = {
        "get_oee": _ToolResult(content=json.dumps({"oee": 0.91, "cell_id": 2})),
    }
    _antr, mcp, bus = patch_qa(stream_plans=stream_plans, mcp_results=mcp_results)

    messages: list[dict[str, Any]] = []
    await qa.run_qa_turn(ws=ws, messages=messages, user_content="OEE on P-02?")  # type: ignore[arg-type]

    types = [f["type"] for f in ws.sent]
    assert "tool_call" in types
    assert "tool_result" in types
    assert types[-1] == "done"

    tool_call = next(f for f in ws.sent if f["type"] == "tool_call")
    assert tool_call["name"] == "get_oee"
    assert tool_call["args"] == {"cell_id": 2}

    tool_result = next(f for f in ws.sent if f["type"] == "tool_result")
    assert tool_result["name"] == "get_oee"
    assert isinstance(tool_result["summary"], str)
    # Summary is a SHORT string, not the raw JSON — must mention the tool name.
    assert "get_oee" in tool_result["summary"]

    # MCP was actually called once.
    assert mcp.calls == [("get_oee", {"cell_id": 2})]

    # Events bus carries tool_call_started + tool_call_completed with duration.
    started = [e for e in bus.events if e[0] == "tool_call_started"]
    completed = [e for e in bus.events if e[0] == "tool_call_completed"]
    assert len(started) == 1
    assert len(completed) == 1
    assert started[0][1]["agent"] == "qa"
    assert completed[0][1]["agent"] == "qa"
    assert isinstance(completed[0][1]["duration_ms"], int)


@pytest.mark.asyncio
async def test_is_error_result_forwarded_to_llm_and_summary_says_failed(patch_qa) -> None:
    broken = _FakeToolUseBlock(id="tu_1", name="get_signal_anomalies", input={"cell_id": 2})
    stream_plans = [
        ([], [broken]),
        (["done"], [_FakeTextBlock(text="done")]),
    ]
    mcp_results = {
        "get_signal_anomalies": _ToolResult(content="KB misconfigured", is_error=True),
    }
    antr, _, _ = patch_qa(stream_plans=stream_plans, mcp_results=mcp_results)

    ws = _FakeClientWS()
    messages: list[dict[str, Any]] = []
    await qa.run_qa_turn(ws=ws, messages=messages, user_content="anomalies?")  # type: ignore[arg-type]

    # Summary string on chat channel.
    tr = next(f for f in ws.sent if f["type"] == "tool_result")
    assert tr["summary"] == "get_signal_anomalies failed"

    # The is_error=True block is forwarded into the LLM's next turn via messages.
    # antr.stream_calls[1]["messages"] is the SECOND stream call — deep-copied.
    second = antr.stream_calls[1]["messages"]
    last_user = second[-1]
    assert last_user["role"] == "user"
    result_block = last_user["content"][0]
    assert result_block["is_error"] is True
    assert "KB misconfigured" in result_block["content"]


# ---------------------------------------------------------------------------
# render_* — dual channel broadcast
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_render_tool_dual_channel_broadcast(patch_qa) -> None:
    render = _FakeToolUseBlock(
        id="tu_1",
        name="render_bar_chart",
        input={
            "cell_id": 2,
            "title": "OEE per week",
            "x_label": "week",
            "y_label": "OEE",
            "bars": [],
        },
    )
    stream_plans = [
        ([], [render]),
        (["done"], [_FakeTextBlock(text="done")]),
    ]
    _antr, _mcp, bus = patch_qa(stream_plans=stream_plans)

    ws = _FakeClientWS()
    messages: list[dict[str, Any]] = []
    await qa.run_qa_turn(ws=ws, messages=messages, user_content="graph it")  # type: ignore[arg-type]

    # Events bus ui_render
    ui_bus = next(e for e in bus.events if e[0] == "ui_render")[1]
    assert ui_bus["agent"] == "qa"
    assert ui_bus["component"] == "bar_chart"  # render_ prefix stripped
    assert "turn_id" in ui_bus

    # Chat channel ui_render — no agent / turn_id per ChatMap
    ui_chat = next(f for f in ws.sent if f["type"] == "ui_render")
    assert ui_chat["component"] == "bar_chart"
    assert ui_chat["props"]["title"] == "OEE per week"


# ---------------------------------------------------------------------------
# ask_investigator handoff
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ask_investigator_dual_channel_handoff(
    patch_qa, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_answer(cell_id: int, question: str) -> dict[str, Any]:
        return {
            "answer": "Last trip was a bearing wear on 2026-01-18.",
            "cited_work_order_ids": [12],
            "cited_failure_ids": [3],
            "confidence": 0.8,
        }

    monkeypatch.setattr(qa, "answer_investigator_question", fake_answer)

    ask = _FakeToolUseBlock(
        id="tu_1",
        name="ask_investigator",
        input={"cell_id": 2, "question": "Why did P-02 trip yesterday?"},
    )
    stream_plans = [
        ([], [ask]),
        (["ok"], [_FakeTextBlock(text="ok")]),
    ]
    antr, _, bus = patch_qa(stream_plans=stream_plans)

    ws = _FakeClientWS()
    await qa.run_qa_turn(ws=ws, messages=[], user_content="Why did P-02 trip yesterday?")  # type: ignore[arg-type]

    # Events bus: underscored field names.
    ho_bus = next(e for e in bus.events if e[0] == "agent_handoff")[1]
    assert ho_bus["from_agent"] == "qa"
    assert ho_bus["to_agent"] == "investigator"

    # Chat channel: unprefixed field names.
    ho_chat = next(f for f in ws.sent if f["type"] == "agent_handoff")
    assert ho_chat["from"] == "qa"
    assert ho_chat["to"] == "investigator"
    assert ho_chat["reason"].startswith("Why did P-02")

    # Child investigator agent_start / agent_end fired.
    starts = [e for e in bus.events if e[0] == "agent_start" and e[1]["agent"] == "investigator"]
    ends = [e for e in bus.events if e[0] == "agent_end" and e[1]["agent"] == "investigator"]
    assert len(starts) == 1
    assert len(ends) == 1
    assert ends[0][1]["finish_reason"] == "answered"

    # tool_result content handed to the LLM is the JSON-encoded answer.
    second = antr.stream_calls[1]["messages"]
    tool_result = second[-1]["content"][0]
    assert tool_result["is_error"] is False
    parsed = json.loads(tool_result["content"])
    assert parsed["answer"].startswith("Last trip")


@pytest.mark.asyncio
async def test_ask_investigator_rejects_missing_cell_id(patch_qa) -> None:
    ask = _FakeToolUseBlock(id="tu_1", name="ask_investigator", input={"question": "what?"})
    stream_plans = [
        ([], [ask]),
        (["ok"], [_FakeTextBlock(text="ok")]),
    ]
    antr, _, _ = patch_qa(stream_plans=stream_plans)

    ws = _FakeClientWS()
    await qa.run_qa_turn(ws=ws, messages=[], user_content="x")  # type: ignore[arg-type]

    second = antr.stream_calls[1]["messages"]
    tool_result = second[-1]["content"][0]
    assert tool_result["is_error"] is True
    parsed = json.loads(tool_result["content"])
    assert "cell_id missing" in parsed["answer"]


# ---------------------------------------------------------------------------
# Crash + bad-input paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_user_content_returns_done_error(patch_qa) -> None:
    patch_qa(stream_plans=[])
    ws = _FakeClientWS()
    await qa.run_qa_turn(ws=ws, messages=[], user_content="   ")  # type: ignore[arg-type]
    assert ws.sent == [{"type": "done", "error": "empty message"}]


@pytest.mark.asyncio
async def test_crash_during_turn_emits_agent_end_and_done_error(
    patch_qa, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def raising_stream(**_kwargs: Any) -> tuple[list[Any], list[Any]]:
        raise RuntimeError("boom")

    monkeypatch.setattr(qa, "_stream_one_turn", raising_stream)
    patch_qa(stream_plans=[])
    ws = _FakeClientWS()
    _antr, _mcp, bus = patch_qa(stream_plans=[])

    await qa.run_qa_turn(ws=ws, messages=[], user_content="hi")  # type: ignore[arg-type]

    end = next(e for e in bus.events if e[0] == "agent_end")[1]
    assert end["finish_reason"] == "error"
    done = next(f for f in ws.sent if f["type"] == "done")
    assert "RuntimeError" in done.get("error", "")


# ---------------------------------------------------------------------------
# Summary helper
# ---------------------------------------------------------------------------


def test_summarise_tool_result_handles_list_dict_scalar_error() -> None:
    # list
    s = qa._summarise_tool_result("get_foo", json.dumps([1, 2, 3]), False)
    assert s == "get_foo returned 3 row(s)"
    # dict
    s = qa._summarise_tool_result("get_kb", json.dumps({"a": 1, "b": 2}), False)
    assert "a" in s and "b" in s and s.startswith("get_kb returned")
    # bare string
    s = qa._summarise_tool_result("get_x", "hello world", False)
    assert s == "hello world"
    # error
    s = qa._summarise_tool_result("get_x", "anything", True)
    assert s == "get_x failed"
    # empty content
    s = qa._summarise_tool_result("get_x", "", False)
    assert "no content" in s


# ---------------------------------------------------------------------------
# Schema sanity
# ---------------------------------------------------------------------------


def test_ask_investigator_tool_shape() -> None:
    assert qa.ASK_INVESTIGATOR_TOOL["name"] == "ask_investigator"
    required = qa.ASK_INVESTIGATOR_TOOL["input_schema"]["required"]
    assert {"cell_id", "question"} <= set(required)


# ---------------------------------------------------------------------------
# answer_investigator_question — happy + fallback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_answer_investigator_question_returns_fallback_on_db_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def boom(_cell_id: int) -> dict[str, Any]:
        raise RuntimeError("no db")

    monkeypatch.setattr(qa, "_collect_diagnostic_context", boom)
    out = await qa.answer_investigator_question(cell_id=2, question="why?")
    assert out["answer"].startswith("Diagnostic context unavailable")
    assert out["confidence"] == 0.0
    assert out["cited_work_order_ids"] == []
    assert out["cited_failure_ids"] == []


@pytest.mark.asyncio
async def test_answer_investigator_question_returns_fallback_on_llm_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def ok_context(_cell_id: int) -> dict[str, Any]:
        return {"work_orders": [], "failures": []}

    class _BoomAnthropic:
        class _Messages:
            async def create(self, **_k: Any) -> Any:
                raise RuntimeError("API down")

        messages = _Messages()

    monkeypatch.setattr(qa, "_collect_diagnostic_context", ok_context)
    monkeypatch.setattr(qa, "anthropic", _BoomAnthropic())
    out = await qa.answer_investigator_question(cell_id=2, question="why?")
    assert out["answer"].startswith("Diagnostic query failed")
    assert out["confidence"] == 0.0


@pytest.mark.asyncio
async def test_answer_investigator_question_happy_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def ok_context(_cell_id: int) -> dict[str, Any]:
        return {
            "work_orders": [{"id": 12, "rca_summary": "bearing wear"}],
            "failures": [{"id": 3, "failure_mode": "bearing_wear"}],
        }

    # `parse_json_response` uses `isinstance(block, TextBlock)` so the fake
    # content list must carry real ``anthropic.types.TextBlock`` instances.
    from anthropic.types import TextBlock as _RealTextBlock

    @dataclass
    class _Msg:
        content: list[Any]

    class _Fake:
        class _Messages:
            async def create(self, **_k: Any) -> _Msg:
                return _Msg(
                    content=[
                        _RealTextBlock(
                            type="text",
                            text=json.dumps(
                                {
                                    "answer": "Recurring bearing wear on cell 2.",
                                    "cited_work_order_ids": [12],
                                    "cited_failure_ids": [3],
                                    "confidence": 0.85,
                                }
                            ),
                            citations=None,
                        )
                    ]
                )

        messages = _Messages()

    monkeypatch.setattr(qa, "_collect_diagnostic_context", ok_context)
    monkeypatch.setattr(qa, "anthropic", _Fake())
    out = await qa.answer_investigator_question(cell_id=2, question="why?")
    assert out["answer"].startswith("Recurring bearing wear")
    assert out["cited_work_order_ids"] == [12]
    assert out["confidence"] == pytest.approx(0.85)
