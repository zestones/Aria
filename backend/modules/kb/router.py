"""KB + failure history router."""

from __future__ import annotations

import asyncio
import logging

import asyncpg
from agents.kb_builder import (
    bootstrap_thresholds,
    extract_from_pdf,
    start_onboarding,
    submit_onboarding_message,
)
from agents.kb_builder._ws_stub import broadcast_stub
from aria_mcp.client import mcp_client
from core.api_response import created, ok
from core.database import get_db
from core.exceptions import NotFoundError
from core.json_fields import decode_record
from core.security import Role, get_current_user, require_role
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from modules.kb.repository import JSON_FIELDS, KbRepository
from modules.kb.schemas import (
    EquipmentKbOut,
    EquipmentKbUpsert,
    FailureHistoryOut,
    OnboardingMessageIn,
)

log = logging.getLogger("aria.kb.router")

# Per-cell upload serialisation. Two operators uploading to the same cell
# concurrently would otherwise race on the kb_meta.version bump and the
# calibration_log append. The lock dict is process-local — fine for a single
# uvicorn worker (M3.2 acceptance criterion). Multi-worker deployments would
# need a Postgres advisory lock instead.
_upload_locks: dict[int, asyncio.Lock] = {}

router = APIRouter(
    prefix="/api/v1/kb",
    tags=["kb"],
    dependencies=[Depends(get_current_user)],
)


def _ser_kb(r):
    return EquipmentKbOut.model_validate(decode_record(r, JSON_FIELDS)).model_dump(mode="json")


def _ser_failure(r):
    return FailureHistoryOut.model_validate(decode_record(r, JSON_FIELDS)).model_dump(mode="json")


# 5 phase labels — kept in sync with issue #22 §2 acceptance criterion
# ("PDF upload emits exactly 5 ui_render events with component kb_progress").
_UPLOAD_PHASES: tuple[str, ...] = (
    "Validating PDF",
    "Reading pages with Opus vision",
    "Extracting thresholds",
    "Validating schema",
    "Saving knowledge base",
)


def _phase_status(idx: int, active_idx: int) -> str:
    if idx < active_idx:
        return "done"
    if idx == active_idx:
        return "in_progress"
    return "pending"


def _upload_steps(active_idx: int) -> list[dict[str, str]]:
    return [
        {"label": label, "status": _phase_status(i, active_idx)}
        for i, label in enumerate(_UPLOAD_PHASES)
    ]


async def _emit_upload_phase(cell_id: int, active_idx: int) -> None:
    """Stub WS broadcast for one PDF-upload phase. See M3.6 (#22) / M4.1 (#23)."""
    await broadcast_stub(
        "ui_render",
        {
            "agent": "kb_builder",
            "component": "kb_progress",
            "props": {"cell_id": cell_id, "steps": _upload_steps(active_idx)},
            "turn_id": None,  # set by orchestrator ContextVar after M4.1 (#23)
        },
    )


@router.get("/equipment")
async def list_kb(conn: asyncpg.Connection = Depends(get_db)):
    rows = await KbRepository(conn).list()
    return ok([_ser_kb(r) for r in rows])


@router.get("/equipment/{cell_id}")
async def get_kb(cell_id: int, conn: asyncpg.Connection = Depends(get_db)):
    rec = await KbRepository(conn).get_by_cell(cell_id)
    if not rec:
        raise NotFoundError(f"No equipment KB entry for cell {cell_id}")
    return ok(_ser_kb(rec))


@router.put("/equipment")
async def upsert_kb(
    body: EquipmentKbUpsert,
    _user=Depends(require_role(Role.ADMIN, Role.OPERATOR)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await KbRepository(conn).upsert(body.model_dump(exclude_unset=True))
    return created(_ser_kb(rec))


@router.post("/equipment/{cell_id}/upload")
async def upload_pdf(
    cell_id: int,
    file: UploadFile,
    _user=Depends(require_role(Role.ADMIN, Role.OPERATOR)),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Extract a KB from a PDF manual and write it via the MCP tool.

    Pipeline (mirrors issue #18 §6 + §7):

    1. Validate content type + serialise per-cell uploads (`_upload_locks`).
    2. ``extract_from_pdf`` — Opus vision with 1 retry on parse failure.
    3. ``bootstrap_thresholds`` — fill missing ``kb_threshold_key`` entries
       with null-alert stubs so the repository guard does not 422.
    4. ``mcp_client.call_tool("update_equipment_kb", ...)`` — the only
       sanctioned write path; bumps version, appends calibration_log,
       recomputes completeness.
    5. Re-read and serialise via ``EquipmentKbOut``.

    Phase events are emitted via ``broadcast_stub`` (M3.6 / issue #22). Each
    call will become ``ws_manager.broadcast("ui_render", ...)`` once M4.1
    (#23) lands; the payload shape is already final, only the transport is
    stubbed.
    """
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(400, "File must be a PDF")

    lock = _upload_locks.setdefault(cell_id, asyncio.Lock())
    async with lock:
        await _emit_upload_phase(cell_id, 0)
        pdf_bytes = await file.read()
        if not pdf_bytes:
            raise HTTPException(400, "Uploaded file is empty")

        await _emit_upload_phase(cell_id, 1)
        try:
            await _emit_upload_phase(cell_id, 2)
            kb, raw_markdown = await extract_from_pdf(pdf_bytes, cell_id)
        except ValueError as e:
            # ValidationError is a subclass of ValueError, so this single
            # branch covers both the page-count guard and the post-retry parse
            # failure. Page-count message starts with "PDF has N pages" \u2014
            # map that to 413, otherwise 422.
            msg = str(e)
            if msg.startswith("PDF has "):
                raise HTTPException(413, msg) from e
            raise HTTPException(422, f"Extraction failed after retry: {msg}") from e

        await _emit_upload_phase(cell_id, 3)
        kb_dict = kb.model_dump(exclude={"kb_meta"})
        kb_dict = await bootstrap_thresholds(cell_id, kb_dict)

        await _emit_upload_phase(cell_id, 4)
        result = await mcp_client.call_tool(
            "update_equipment_kb",
            {
                "cell_id": cell_id,
                "structured_data_patch": kb_dict,
                "source": "pdf_extraction",
                "calibrated_by": "kb_builder_agent",
                "raw_markdown": raw_markdown,
            },
        )
        if result.is_error:
            raise HTTPException(500, f"KB write failed: {result.content}")

        rec = await KbRepository(conn).get_by_cell(cell_id)
        if rec is None:
            # Should be impossible — update_equipment_kb just returned success.
            raise NotFoundError(f"No equipment KB entry for cell {cell_id} after upload")
        return ok(_ser_kb(rec))


@router.get("/failures")
async def list_failures(
    cell_id: int | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await KbRepository(conn).list_failures(cell_id, limit)
    return ok([_ser_failure(r) for r in rows])
    return ok([_ser_failure(r) for r in rows])


# ── M3.3 — onboarding session endpoints ──────────────────────────────────────
#
# State + Sonnet extraction + MCP write all live in
# ``agents/kb_builder.py``. These handlers are intentionally thin: auth +
# HTTP shape only.


@router.post("/equipment/{cell_id}/onboarding/start")
async def onboarding_start(
    cell_id: int,
    _user=Depends(require_role(Role.ADMIN, Role.OPERATOR)),
):
    """Open a 4-question onboarding session for ``cell_id``.

    Gates (see ``start_onboarding``):
    - 404 when no ``equipment_kb`` row exists.
    - 409 when the KB has no thresholds (PDF must be uploaded first).
    - 409 when a session is already active for the cell.
    """
    payload = await start_onboarding(cell_id)
    return created(payload)


@router.post("/equipment/{cell_id}/onboarding/message")
async def onboarding_message(
    cell_id: int,
    body: OnboardingMessageIn,
    _user=Depends(require_role(Role.ADMIN, Role.OPERATOR)),
):
    """Submit one operator answer; receive the next question or the final KB.

    The ``cell_id`` path parameter is informative — the session is resolved
    by ``session_id`` alone. Returns either
    ``{session_id, question_index, question, total_questions}`` or
    ``{session_id, complete: true, kb: EquipmentKbOut-shaped dict}``.
    """
    result = await submit_onboarding_message(body.session_id, body.answer)
    if result.get("complete"):
        # Re-serialise via the canonical DTO so the response matches every
        # other ``equipment_kb`` endpoint (timestamps as ISO strings, etc.).
        kb_record = result["kb"]
        result["kb"] = EquipmentKbOut.model_validate(kb_record).model_dump(mode="json")
    return ok(result)
