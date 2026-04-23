"""``service.start_onboarding`` + ``submit_onboarding_message`` orchestration.

Covers M3.3 acceptance criteria that are testable without a live database
or Anthropic call:

- 4-message advance + complete flow (#1, #2 partial, #3, #4)
- 409 on KB without thresholds (#5)
- 409 on already-active session (#6)
- ``OnboardingPatch`` ValidationError surfaces (#7 — caught by ``extract_patch``;
  here we assert the orchestrator does not swallow it)
- ``onboarding_complete=True`` is passed to the MCP write only on Q4 (#3, #4)

DB and MCP are stubbed; ``extract_patch`` is monkeypatched to return canned
patches so no Anthropic call is made. Live-stack validation lives in
``backend/tests/e2e/`` (planned follow-up — see issue #19 comment).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import pytest
from agents.kb_builder.onboarding import service, session_store
from agents.kb_builder.onboarding.questions import QUESTIONS
from core.exceptions import ConflictError, NotFoundError, ValidationFailedError

# ── shared fakes ─────────────────────────────────────────────────────────────


@dataclass
class _ToolResult:
    content: str = "{}"
    is_error: bool = False


class _FakeMCP:
    def __init__(self, result: _ToolResult | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._result = result or _ToolResult()

    async def call_tool(self, name: str, args: dict[str, Any]) -> _ToolResult:
        self.calls.append((name, args))
        return self._result


class _FakeRepo:
    """Stub for ``KbRepository`` used by ``service``. Only the methods
    actually called from ``service`` are implemented."""

    def __init__(self, row: dict | None) -> None:
        self._row = row

    async def get_by_cell(self, cell_id: int):
        return self._row


@asynccontextmanager
async def _fake_acquire():
    yield object()


class _FakePool:
    def acquire(self):
        return _fake_acquire()


class _FakeDB:
    pool = _FakePool()


def _patch_db_layer(monkeypatch: pytest.MonkeyPatch, row: dict | None) -> None:
    """Make ``service`` use a stubbed pool + a repo returning ``row``."""

    monkeypatch.setattr(service, "db", _FakeDB())
    monkeypatch.setattr(service, "KbRepository", lambda _conn: _FakeRepo(row), raising=True)


@pytest.fixture(autouse=True)
def _reset_store():
    session_store.SESSIONS.clear()
    session_store.SESSIONS_BY_CELL.clear()
    yield
    session_store.SESSIONS.clear()
    session_store.SESSIONS_BY_CELL.clear()


def _kb_row_with_thresholds(vibration_nominal: float | None = 4.5) -> dict:
    """Mimic ``KbRepository.get_by_cell`` + ``decode_record`` shape.

    ``service.start_onboarding`` calls ``decode_record(rec, JSON_FIELDS)``.
    For our fake we pass an already-decoded dict — ``decode_record`` is a
    pure helper that returns the input mostly untouched when fields are
    already dicts.
    """
    return {
        "cell_id": 1,
        "structured_data": {
            "thresholds": {
                "vibration_mm_s": {"nominal": vibration_nominal, "alert": 4.5},
            }
        },
    }


# ── _format_vibration_value ──────────────────────────────────────────────────


@pytest.mark.unit
@pytest.mark.parametrize(
    ("entry", "expected"),
    [
        ({"nominal": 4.5}, "4.5 mm/s"),
        ({"alert": 6.5}, "6.5 mm/s"),  # falls back to alert
        ({"nominal": 2.4, "alert": 4.3, "unit": "mm/s"}, "2.4 mm/s"),
        ({}, "the manufacturer's value"),  # null-stub fallback
    ],
)
def test_format_vibration_value(entry, expected):
    assert service._format_vibration_value({"vibration_mm_s": entry}) == expected


@pytest.mark.unit
def test_format_vibration_value_when_key_missing():
    assert service._format_vibration_value({}) == "the manufacturer's value"


# ── start_onboarding gates ───────────────────────────────────────────────────


@pytest.mark.unit
@pytest.mark.asyncio
async def test_start_raises_404_when_no_kb_row(monkeypatch: pytest.MonkeyPatch):
    _patch_db_layer(monkeypatch, row=None)
    with pytest.raises(NotFoundError):
        await service.start_onboarding(cell_id=99)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_start_raises_409_when_kb_has_no_thresholds(
    monkeypatch: pytest.MonkeyPatch,
):
    _patch_db_layer(monkeypatch, row={"structured_data": {"thresholds": {}}})
    with pytest.raises(ConflictError) as exc_info:
        await service.start_onboarding(cell_id=1)
    assert "Upload a PDF manual first" in str(exc_info.value)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_start_raises_409_when_session_already_active(
    monkeypatch: pytest.MonkeyPatch,
):
    _patch_db_layer(monkeypatch, row=_kb_row_with_thresholds())
    first = await service.start_onboarding(cell_id=1)
    assert "session_id" in first
    with pytest.raises(ConflictError) as exc_info:
        await service.start_onboarding(cell_id=1)
    assert "already in progress" in str(exc_info.value)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_start_renders_q1_with_extracted_vibration_value(
    monkeypatch: pytest.MonkeyPatch,
):
    _patch_db_layer(monkeypatch, row=_kb_row_with_thresholds(vibration_nominal=4.5))
    payload = await service.start_onboarding(cell_id=1)
    assert "4.5 mm/s" in payload["question"]
    assert payload["question_index"] == 0
    assert payload["total_questions"] == len(QUESTIONS)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_start_q1_falls_back_when_vibration_value_missing(
    monkeypatch: pytest.MonkeyPatch,
):
    _patch_db_layer(monkeypatch, row=_kb_row_with_thresholds(vibration_nominal=None))
    # nominal=None AND alert=4.5 → falls back to alert.
    payload = await service.start_onboarding(cell_id=1)
    assert "4.5 mm/s" in payload["question"]


# ── submit_onboarding_message orchestration ──────────────────────────────────


@pytest.mark.unit
@pytest.mark.asyncio
async def test_submit_unknown_session_raises_not_found(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(service, "extract_patch", _unused_extract_patch)
    monkeypatch.setattr(service, "mcp_client", _FakeMCP())
    with pytest.raises(NotFoundError):
        await service.submit_onboarding_message("does-not-exist", "anything")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_submit_advances_q1_to_q2(monkeypatch: pytest.MonkeyPatch):
    _patch_db_layer(monkeypatch, row=_kb_row_with_thresholds())
    fake_mcp = _FakeMCP()
    monkeypatch.setattr(service, "mcp_client", fake_mcp)
    monkeypatch.setattr(
        service,
        "extract_patch",
        _make_extract({"thresholds": {"vibration_mm_s": {"nominal": 2.4}}}),
    )

    started = await service.start_onboarding(cell_id=1)
    sid = started["session_id"]

    out = await service.submit_onboarding_message(sid, "around 2.4 mm/s")

    assert out["question_index"] == 1
    assert "complete" not in out
    # Session advanced; not yet dropped.
    assert sid in session_store.SESSIONS
    assert session_store.SESSIONS[sid].question_index == 1
    # MCP write happened with source/calibrated_by, NO onboarding_complete.
    assert fake_mcp.calls[0][0] == "update_equipment_kb"
    args = fake_mcp.calls[0][1]
    assert args["source"] == "onboarding"
    assert args["calibrated_by"] == "operator"
    assert "onboarding_complete" not in args


@pytest.mark.unit
@pytest.mark.asyncio
async def test_submit_full_4_message_flow_completes(monkeypatch: pytest.MonkeyPatch):
    _patch_db_layer(monkeypatch, row=_kb_row_with_thresholds())
    fake_mcp = _FakeMCP()
    monkeypatch.setattr(service, "mcp_client", fake_mcp)
    monkeypatch.setattr(service, "extract_patch", _make_extract({}))

    started = await service.start_onboarding(cell_id=1)
    sid = started["session_id"]

    # Q1, Q2, Q3 → return next question
    for _ in range(3):
        out = await service.submit_onboarding_message(sid, "operator answer")
        assert "complete" not in out

    # Q4 → returns {complete: True, kb}
    final = await service.submit_onboarding_message(sid, "ambient 40°C")

    assert final["complete"] is True
    assert "kb" in final
    # Session was dropped from both indexes.
    assert sid not in session_store.SESSIONS
    assert 1 not in session_store.SESSIONS_BY_CELL
    # 4 MCP writes happened, only the LAST one carries onboarding_complete=True.
    assert len(fake_mcp.calls) == 4
    for call in fake_mcp.calls[:3]:
        assert "onboarding_complete" not in call[1]
    assert fake_mcp.calls[-1][1]["onboarding_complete"] is True


@pytest.mark.unit
@pytest.mark.asyncio
async def test_submit_keeps_session_when_mcp_errors(monkeypatch: pytest.MonkeyPatch):
    _patch_db_layer(monkeypatch, row=_kb_row_with_thresholds())
    fake_mcp = _FakeMCP(result=_ToolResult(content="boom", is_error=True))
    monkeypatch.setattr(service, "mcp_client", fake_mcp)
    monkeypatch.setattr(service, "extract_patch", _make_extract({}))

    started = await service.start_onboarding(cell_id=1)
    sid = started["session_id"]

    with pytest.raises(ValidationFailedError) as exc_info:
        await service.submit_onboarding_message(sid, "answer")
    assert "boom" in str(exc_info.value)
    # Session must still exist at the same question_index so operator retries.
    assert sid in session_store.SESSIONS
    assert session_store.SESSIONS[sid].question_index == 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_submit_propagates_extract_patch_validation_error(
    monkeypatch: pytest.MonkeyPatch,
):
    _patch_db_layer(monkeypatch, row=_kb_row_with_thresholds())
    fake_mcp = _FakeMCP()
    monkeypatch.setattr(service, "mcp_client", fake_mcp)

    async def _boom(*_args, **_kwargs):
        raise ValueError("Sonnet kept emitting bad JSON")

    monkeypatch.setattr(service, "extract_patch", _boom)

    started = await service.start_onboarding(cell_id=1)
    sid = started["session_id"]

    with pytest.raises(ValueError, match="Sonnet"):
        await service.submit_onboarding_message(sid, "answer")
    # No MCP write happened, session stays at q=0.
    assert fake_mcp.calls == []
    assert session_store.SESSIONS[sid].question_index == 0


# ── helpers ──────────────────────────────────────────────────────────────────


def _make_extract(canned_patch: dict):
    async def _impl(_answer: str, _hint: str, _cell_id: int) -> dict:
        return canned_patch

    return _impl


async def _unused_extract_patch(*_args, **_kwargs):  # pragma: no cover
    raise AssertionError("extract_patch should not run when session is missing")
