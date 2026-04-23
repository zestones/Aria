"""Unit tests for :mod:`agents.kb_builder.qa.answer_kb_question` (M3.5, issue #21).

Covers the acceptance criteria that are testable without a live Anthropic
call or live MCP server:

- Returns ``{answer, source, confidence}`` on the happy path.
- Returns the documented fallback dict (no raise) when the KB is missing.
- Returns the documented fallback dict (no raise) when the LLM call fails.
- Performs no DB writes (verified by stubbing — there is no DB call to make).
- Performs no WebSocket broadcasts (verified by absence — no ``ws_manager``
  import in the module under test, asserted below).
- Uses ``model_for("chat")`` so a demo-day flip to ``ARIA_MODEL=opus`` does
  not silently switch this handler to Opus.

End-to-end validation (real Sonnet, real MCP, real Postgres) is deferred —
the M2.5 integration tests already cover ``get_equipment_kb``, and this
function adds no DB writes of its own.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest
from agents.kb_builder import qa


@dataclass
class _ToolResult:
    content: str = '{"thresholds": {"vibration": {"nominal": 4.5}}}'
    is_error: bool = False


class _FakeMCP:
    def __init__(self, result: _ToolResult | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._result = result or _ToolResult()

    async def call_tool(self, name: str, args: dict[str, Any]) -> _ToolResult:
        self.calls.append((name, args))
        return self._result


class _FakeAnthropic:
    """Minimal stand-in for the ``anthropic`` async client.

    Captures the kwargs of each ``messages.create`` call so tests can assert
    on the model used and the prompt shape, then returns a canned ``Message``
    that ``parse_json_response`` will accept.
    """

    def __init__(self, response_text: str) -> None:
        self.calls: list[dict[str, Any]] = []
        self._response_text = response_text
        self.messages = self._Messages(self)

    class _Messages:
        def __init__(self, outer: "_FakeAnthropic") -> None:
            self._outer = outer

        async def create(self, **kwargs: Any) -> Any:
            self._outer.calls.append(kwargs)
            from anthropic.types import Message, TextBlock, Usage

            return Message(
                id="msg_test",
                type="message",
                role="assistant",
                model=kwargs.get("model", "claude-sonnet-4-5"),
                content=[TextBlock(type="text", text=self._outer._response_text)],
                stop_reason="end_turn",
                stop_sequence=None,
                usage=Usage(input_tokens=10, output_tokens=10),
            )


def _patch(
    monkeypatch: pytest.MonkeyPatch,
    *,
    mcp: _FakeMCP,
    anthropic_client: _FakeAnthropic | None = None,
) -> None:
    monkeypatch.setattr(qa, "mcp_client", mcp)
    if anthropic_client is not None:
        monkeypatch.setattr(qa, "anthropic", anthropic_client)


# ── happy path ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_returns_parsed_json_on_happy_path(monkeypatch):
    mcp = _FakeMCP()
    fake = _FakeAnthropic(
        response_text='{"answer": "120 Nm", "source": "thresholds.bolt_torque", "confidence": 0.9}'
    )
    _patch(monkeypatch, mcp=mcp, anthropic_client=fake)

    out = await qa.answer_kb_question(2, "What is the max bolt torque?")

    assert out == {"answer": "120 Nm", "source": "thresholds.bolt_torque", "confidence": 0.9}
    assert mcp.calls == [("get_equipment_kb", {"cell_id": 2})]
    # Single Anthropic call with the expected wiring
    assert len(fake.calls) == 1
    call = fake.calls[0]
    assert call["model"] == "claude-sonnet-4-5"  # always Sonnet — see acceptance #2 / cost guard
    assert call["max_tokens"] == 1024
    assert "knowledge base" in call["system"].lower()
    user_content = call["messages"][0]["content"]
    assert "Equipment KB:" in user_content
    assert "What is the max bolt torque?" in user_content


@pytest.mark.asyncio
async def test_unknown_answer_is_passed_through_not_hallucinated(monkeypatch):
    """If the LLM says ``unknown``, we forward it verbatim — no second-guessing."""

    mcp = _FakeMCP()
    fake = _FakeAnthropic(response_text='{"answer": "unknown", "source": null, "confidence": 0.0}')
    _patch(monkeypatch, mcp=mcp, anthropic_client=fake)

    out = await qa.answer_kb_question(2, "What colour is the casing?")

    assert out["answer"] == "unknown"
    assert out["source"] is None
    assert out["confidence"] == 0.0


# ── KB missing ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_returns_kb_unavailable_when_mcp_reports_error(monkeypatch):
    mcp = _FakeMCP(_ToolResult(content="cell 99 not found", is_error=True))
    # Anthropic must NOT be called when the KB lookup fails — pass a sentinel
    # whose .messages.create would raise if called.
    sentinel = _FakeAnthropic(response_text="should-not-be-called")

    async def _boom(**_: Any) -> Any:
        raise AssertionError("anthropic.messages.create must not be invoked when KB is missing")

    sentinel.messages.create = _boom  # type: ignore[assignment]
    _patch(monkeypatch, mcp=mcp, anthropic_client=sentinel)

    out = await qa.answer_kb_question(99, "Anything?")

    assert out == {
        "answer": "KB not available for cell 99",
        "source": None,
        "confidence": 0.0,
    }
    assert mcp.calls == [("get_equipment_kb", {"cell_id": 99})]


# ── error fallback ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_returns_safe_fallback_when_anthropic_raises(monkeypatch):
    """A Sonnet timeout or transport error must NOT bubble up to the caller —
    the Investigator tool loop relies on getting a dict back."""

    mcp = _FakeMCP()

    class _ExplodingAnthropic(_FakeAnthropic):
        class _Messages:
            async def create(self, **_: Any) -> Any:
                raise RuntimeError("simulated transport failure")

        def __init__(self) -> None:
            self.messages = self._Messages()

    _patch(monkeypatch, mcp=mcp, anthropic_client=_ExplodingAnthropic())

    out = await qa.answer_kb_question(2, "Anything?")

    assert out == {
        "answer": "KB query failed — information unavailable",
        "source": None,
        "confidence": 0.0,
    }


@pytest.mark.asyncio
async def test_returns_safe_fallback_when_response_is_not_json(monkeypatch):
    """``parse_json_response`` raising ``ValueError`` must be swallowed too."""

    mcp = _FakeMCP()
    fake = _FakeAnthropic(response_text="I am sorry, I cannot answer that.")
    _patch(monkeypatch, mcp=mcp, anthropic_client=fake)

    out = await qa.answer_kb_question(2, "Anything?")

    assert out["answer"] == "KB query failed — information unavailable"
    assert out["confidence"] == 0.0


# ── contract guard: no WS broadcasts, no DB writes ───────────────────────────


def test_module_does_not_import_ws_manager_or_db():
    """Static guard for the issue's "pure handler" contract.

    The M4.6 orchestrator owns ``agent_handoff`` / ``agent_start`` /
    ``agent_end``. If this module ever starts broadcasting on its own, the
    Activity Feed will show duplicates — fail fast at test time.
    """

    import ast
    import inspect

    tree = ast.parse(inspect.getsource(qa))
    # Drop module/function/class docstrings so the guard only inspects code.
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if (
                node.body
                and isinstance(node.body[0], ast.Expr)
                and isinstance(node.body[0].value, ast.Constant)
                and isinstance(node.body[0].value.value, str)
            ):
                node.body.pop(0)
    code_only = ast.unparse(tree)

    assert "ws_manager" not in code_only
    assert "broadcast" not in code_only
    # No direct DB import either — all KB access must go through MCP.
    assert "from core import database" not in code_only
    assert "import asyncpg" not in code_only
