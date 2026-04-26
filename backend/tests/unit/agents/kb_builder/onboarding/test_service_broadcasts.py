"""Tests for the M3.6 (#22) WebSocket broadcast stubs in the onboarding flow.

Covers acceptance #3 (each onboarding answer emits a progress event) and
#4 (the end of onboarding emits one ``equipment_kb_card`` event), and #5
(events fire AFTER the MCP write completes — verified by spying on the
order of MCP calls vs broadcast invocations).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import pytest
from agents.kb_builder.onboarding import service, session_store
from agents.kb_builder.onboarding.questions import QUESTIONS

# ── shared fakes (mirror those in test_service.py to keep this file standalone) ──


@dataclass
class _ToolResult:
    content: str = "{}"
    is_error: bool = False


class _FakeMCP:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def call_tool(self, name: str, args: dict[str, Any]) -> _ToolResult:
        self.calls.append((name, args))
        return _ToolResult()


class _FakeRepo:
    def __init__(self, row: dict | None) -> None:
        self._row = row

    async def get_by_cell(self, _cell_id: int):
        return self._row


@asynccontextmanager
async def _fake_acquire():
    yield object()


class _FakePool:
    def acquire(self):
        return _fake_acquire()


class _FakeDB:
    pool = _FakePool()


def _kb_row(vibration_nominal: float = 4.5) -> dict[str, Any]:
    return {
        "cell_id": 2,
        "structured_data": {
            "thresholds": {
                "vibration_mm_s": {"nominal": vibration_nominal, "alert": 8.1, "unit": "mm/s"}
            }
        },
        "raw_markdown": "",
        "kb_meta": {},
        "completeness_score": 0.5,
    }


def _patch_db(monkeypatch: pytest.MonkeyPatch, row: dict | None) -> None:
    monkeypatch.setattr(service, "db", _FakeDB())
    monkeypatch.setattr(service, "KbRepository", lambda _conn: _FakeRepo(row), raising=True)


@pytest.fixture(autouse=True)
def _reset_store():
    session_store.SESSIONS.clear()
    session_store.SESSIONS_BY_CELL.clear()
    yield
    session_store.SESSIONS.clear()
    session_store.SESSIONS_BY_CELL.clear()


class _Recorder:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def __call__(self, event_type: str, payload: dict[str, Any]) -> None:
        self.events.append((event_type, payload))


def _patch_broadcast(monkeypatch: pytest.MonkeyPatch) -> _Recorder:
    rec = _Recorder()
    monkeypatch.setattr(service.ws_manager, "broadcast", rec)
    return rec


def _patch_extract(monkeypatch: pytest.MonkeyPatch, patch: dict[str, Any]) -> None:
    async def _fake(_answer: str, _hint: str, _cell_id: int) -> dict[str, Any]:
        return patch

    monkeypatch.setattr(service, "extract_patch", _fake)


# ── tests ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_each_answer_emits_one_kb_progress_event_with_cell_id(monkeypatch):
    """Acceptance #3 + #2 — one progress event per answer, cell_id present."""
    row = _kb_row()
    _patch_db(monkeypatch, row)
    mcp = _FakeMCP()
    monkeypatch.setattr(service, "mcp_client", mcp)
    recorder = _patch_broadcast(monkeypatch)
    _patch_extract(monkeypatch, {"thresholds": {"vibration_mm_s": {"nominal": 5.0, "alert": 9.0}}})

    started = await service.start_onboarding(2)
    sid = started["session_id"]

    # Answer Q1
    await service.submit_onboarding_message(sid, "around 5 mm/s")

    progress = [p for _, p in recorder.events if p.get("component") == "kb_progress"]
    assert len(progress) == 1
    assert progress[0]["props"]["cell_id"] == 2
    assert progress[0]["agent"] == "kb_builder"
    # First step done, rest pending/in_progress
    steps = progress[0]["props"]["steps"]
    assert len(steps) == len(QUESTIONS)
    assert steps[0]["status"] == "done"
    assert steps[1]["status"] == "in_progress"
    for s in steps[2:]:
        assert s["status"] == "pending"
    # Sanity — every recorded event uses the ui_render type
    assert all(t == "ui_render" for t, _ in recorder.events)


@pytest.mark.asyncio
async def test_completion_emits_progress_plus_equipment_kb_card(monkeypatch):
    """Acceptance #4 — Q4 completion adds an ``equipment_kb_card`` event."""
    row = _kb_row()
    _patch_db(monkeypatch, row)
    mcp = _FakeMCP()
    monkeypatch.setattr(service, "mcp_client", mcp)
    recorder = _patch_broadcast(monkeypatch)
    _patch_extract(monkeypatch, {"thresholds": {"vibration_mm_s": {"nominal": 5.0, "alert": 9.0}}})

    started = await service.start_onboarding(2)
    sid = started["session_id"]

    for _ in range(len(QUESTIONS)):
        await service.submit_onboarding_message(sid, "ok")

    components = [p["component"] for _, p in recorder.events]
    # 4 progress + 1 final card = 5 total.
    assert components.count("kb_progress") == len(QUESTIONS)
    assert components.count("equipment_kb_card") == 1
    # Card is the LAST event, not interleaved.
    assert components[-1] == "equipment_kb_card"

    card = next(p for _, p in recorder.events if p["component"] == "equipment_kb_card")
    assert card["props"]["cell_id"] == 2
    assert "thresholds.vibration_mm_s" in card["props"]["highlight_fields"]
    assert "failure_patterns" in card["props"]["highlight_fields"]


@pytest.mark.asyncio
async def test_progress_event_fires_after_mcp_write(monkeypatch):
    """Acceptance #5 — the broadcast must be emitted AFTER the MCP write."""
    row = _kb_row()
    _patch_db(monkeypatch, row)
    mcp = _FakeMCP()
    monkeypatch.setattr(service, "mcp_client", mcp)
    recorder = _patch_broadcast(monkeypatch)
    _patch_extract(monkeypatch, {"thresholds": {"vibration_mm_s": {"nominal": 5.0, "alert": 9.0}}})

    # Spy on MCP to record how many events had fired by call time.
    events_at_call: list[int] = []
    original_call = mcp.call_tool

    async def _spy(name: str, args: dict[str, Any]) -> _ToolResult:
        events_at_call.append(len(recorder.events))
        return await original_call(name, args)

    monkeypatch.setattr(mcp, "call_tool", _spy)

    started = await service.start_onboarding(2)
    sid = started["session_id"]
    await service.submit_onboarding_message(sid, "ok")

    # When the MCP call started, no broadcast had been emitted yet.
    assert events_at_call == [0]
    # And after the call returned, exactly one broadcast was emitted.
    assert len([p for _, p in recorder.events if p["component"] == "kb_progress"]) == 1


@pytest.mark.asyncio
async def test_no_broadcast_when_mcp_write_fails(monkeypatch):
    """Failed MCP write must NOT emit a misleading progress event."""
    row = _kb_row()
    _patch_db(monkeypatch, row)

    class _FailingMCP:
        async def call_tool(self, _name: str, _args: dict[str, Any]) -> _ToolResult:
            return _ToolResult(content="boom", is_error=True)

    monkeypatch.setattr(service, "mcp_client", _FailingMCP())
    recorder = _patch_broadcast(monkeypatch)
    _patch_extract(monkeypatch, {"thresholds": {"vibration_mm_s": {"nominal": 5.0, "alert": 9.0}}})

    started = await service.start_onboarding(2)
    sid = started["session_id"]

    from core.exceptions import ValidationFailedError

    with pytest.raises(ValidationFailedError):
        await service.submit_onboarding_message(sid, "ok")

    assert recorder.events == []
