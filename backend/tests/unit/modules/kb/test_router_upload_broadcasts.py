"""Tests for the M3.6 (#22) WebSocket broadcast stubs in the KB upload route.

These tests exercise the orchestration in ``modules.kb.router.upload_pdf``
directly (no FastAPI TestClient — the project does not have HTTP fixtures
yet) by stubbing every collaborator: ``extract_from_pdf``,
``bootstrap_thresholds``, ``mcp_client``, ``KbRepository``, and the
``broadcast_stub`` shim.

Acceptance covered (issue #22 §5):

- #1 PDF upload emits exactly 5 ``ui_render`` events with component ``kb_progress``
- #2 Each progress event includes ``cell_id`` in ``props``
- #5 Events are emitted at the correct moment relative to the MCP write
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any, cast

import pytest
from asyncpg import Connection
from fastapi import UploadFile
from modules.kb import router as kb_router


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


class _Recorder:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def __call__(self, event_type: str, payload: dict[str, Any]) -> None:
        self.events.append((event_type, payload))


class _FakeUpload:
    """Minimal substitute for ``fastapi.UploadFile`` — only fields the route reads."""

    def __init__(self, content: bytes, content_type: str = "application/pdf") -> None:
        self._content = content
        self.content_type = content_type
        self.file = io.BytesIO(content)

    async def read(self) -> bytes:
        return self._content


class _FakeKB:
    """Stand-in for the Pydantic ``EquipmentKB`` returned by ``extract_from_pdf``."""

    def model_dump(self, *, exclude: set[str] | None = None) -> dict[str, Any]:
        return {"thresholds": {"vibration_mm_s": {"nominal": 4.5, "alert": 8.1}}}


class _FakeRepo:
    def __init__(self, row: dict | None) -> None:
        self._row = row

    async def get_by_cell(self, cell_id: int):
        return self._row


def _patch(monkeypatch: pytest.MonkeyPatch, mcp: _FakeMCP, recorder: _Recorder) -> None:
    monkeypatch.setattr(kb_router, "mcp_client", mcp)
    monkeypatch.setattr(kb_router, "broadcast_stub", recorder)

    async def _fake_extract(_bytes: bytes, _cell_id: int):
        return _FakeKB(), "raw markdown"

    async def _fake_bootstrap(_cell_id: int, kb_dict: dict[str, Any]) -> dict[str, Any]:
        return kb_dict

    monkeypatch.setattr(kb_router, "extract_from_pdf", _fake_extract)
    monkeypatch.setattr(kb_router, "bootstrap_thresholds", _fake_bootstrap)
    monkeypatch.setattr(
        kb_router,
        "KbRepository",
        lambda _conn: _FakeRepo({"cell_id": 2, "structured_data": "{}", "raw_markdown": ""}),
        raising=True,
    )


@pytest.fixture(autouse=True)
def _reset_locks():
    kb_router._upload_locks.clear()
    yield
    kb_router._upload_locks.clear()


@pytest.mark.asyncio
async def test_upload_emits_exactly_five_kb_progress_events_in_order(monkeypatch):
    mcp = _FakeMCP()
    recorder = _Recorder()
    _patch(monkeypatch, mcp, recorder)

    # Patch the EquipmentKbOut serialiser so we don't need a real DB row.
    monkeypatch.setattr(kb_router, "_ser_kb", lambda _r: {"cell_id": 2})

    upload = _FakeUpload(b"%PDF-1.4 fake pdf bytes")
    await kb_router.upload_pdf(
        cell_id=2,
        file=cast(UploadFile, upload),
        _user=None,
        conn=cast(Connection, object()),
    )

    # Acceptance #1 — exactly 5 ui_render events with component kb_progress.
    progress = [(t, p) for t, p in recorder.events if p.get("component") == "kb_progress"]
    assert len(progress) == 5
    for t, _ in progress:
        assert t == "ui_render"

    # Phase labels in order, status transitions correctly.
    expected_labels = list(kb_router._UPLOAD_PHASES)
    for active_idx, (_, payload) in enumerate(progress):
        steps = payload["props"]["steps"]
        assert [s["label"] for s in steps] == expected_labels
        # Active step should be in_progress, prior done, later pending.
        for i, step in enumerate(steps):
            if i < active_idx:
                assert step["status"] == "done", f"event {active_idx} step {i}"
            elif i == active_idx:
                assert step["status"] == "in_progress", f"event {active_idx} step {i}"
            else:
                assert step["status"] == "pending", f"event {active_idx} step {i}"


@pytest.mark.asyncio
async def test_upload_each_progress_event_carries_cell_id(monkeypatch):
    """Acceptance #2 — ``cell_id`` is required in every payload."""
    mcp = _FakeMCP()
    recorder = _Recorder()
    _patch(monkeypatch, mcp, recorder)
    monkeypatch.setattr(kb_router, "_ser_kb", lambda _r: {"cell_id": 7})

    upload = _FakeUpload(b"%PDF-1.4 fake")
    await kb_router.upload_pdf(
        cell_id=7,
        file=cast(UploadFile, upload),
        _user=None,
        conn=cast(Connection, object()),
    )

    progress = [p for _, p in recorder.events if p.get("component") == "kb_progress"]
    for payload in progress:
        assert payload["props"]["cell_id"] == 7
        assert payload["agent"] == "kb_builder"


@pytest.mark.asyncio
async def test_upload_saving_event_fires_before_mcp_write(monkeypatch):
    """Acceptance #5 — for the ``Saving knowledge base`` phase, the event
    must be emitted *immediately before* the MCP write so the frontend can
    show the progress bar in flight rather than after the fact.

    (For the kb_progress phases this is the documented contract — the issue
    text asks the events to mark the start of each phase. The post-write
    event semantics from acceptance #5 apply to the onboarding flow, where
    each event reports completion of the previous question.)
    """
    mcp = _FakeMCP()
    recorder = _Recorder()
    _patch(monkeypatch, mcp, recorder)
    monkeypatch.setattr(kb_router, "_ser_kb", lambda _r: {"cell_id": 2})

    # Wrap the MCP call to snapshot how many events had fired by then.
    events_at_mcp_call: list[int] = []
    original_call = mcp.call_tool  # bind BEFORE patching to avoid self-recursion

    async def _spy_call(name: str, args: dict[str, Any]) -> _ToolResult:
        events_at_mcp_call.append(len(recorder.events))
        return await original_call(name, args)

    monkeypatch.setattr(kb_router.mcp_client, "call_tool", _spy_call)

    upload = _FakeUpload(b"%PDF-1.4 fake")
    await kb_router.upload_pdf(
        cell_id=2,
        file=cast(UploadFile, upload),
        _user=None,
        conn=cast(Connection, object()),
    )

    # All 5 progress events must be emitted before the MCP call returns.
    assert events_at_mcp_call == [5]
    assert mcp.calls[0][0] == "update_equipment_kb"
