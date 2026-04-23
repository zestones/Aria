"""Public onboarding orchestration — :func:`start_onboarding`,
:func:`submit_onboarding_message`.

Orchestrates the 4 sub-modules:

1. :mod:`session_store` — TTL sweep, session lifecycle.
2. :mod:`questions` — the catalogue + ``OnboardingPatch`` shape.
3. :mod:`extraction` — Sonnet patch extraction with one-shot retry.
4. :mod:`aria_mcp.client` — the only sanctioned KB write path.

These are the two functions wired into ``modules/kb/router.py`` as
``POST /api/v1/kb/equipment/{cell_id}/onboarding/{start,message}``.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from agents.kb_builder.onboarding import session_store
from agents.kb_builder.onboarding.extraction import extract_patch
from agents.kb_builder.onboarding.questions import QUESTIONS
from agents.kb_builder.onboarding.session_store import OnboardingSession
from aria_mcp.client import mcp_client
from core.database import db
from core.exceptions import ConflictError, NotFoundError, ValidationFailedError
from core.json_fields import decode_record
from modules.kb.repository import JSON_FIELDS, KbRepository

log = logging.getLogger("aria.kb_builder.onboarding.service")


def _format_vibration_value(thresholds: dict[str, Any]) -> str:
    """Return a human phrase for the vibration value extracted from the PDF.

    Picks ``nominal`` first, then ``alert`` (PDFs sometimes only document the
    alert level), and falls back to a neutral phrase when neither is set —
    e.g. when ``bootstrap_thresholds`` filled the entry with a null-stub.
    The unit defaults to ``mm/s`` because the field name (``vibration_mm_s``)
    already carries it; if the PDF reports a different unit we honour it.
    """
    entry = thresholds.get("vibration_mm_s") or {}
    value = entry.get("nominal")
    if value is None:
        value = entry.get("alert")
    if value is None:
        return "the manufacturer's value"
    unit = entry.get("unit") or "mm/s"
    # ``value`` may come back as int, float or string from the JSONB column —
    # str() keeps the rendering robust without importing Decimal.
    return f"{value} {unit}"


async def start_onboarding(cell_id: int) -> dict[str, Any]:
    """Create an onboarding session for ``cell_id`` and return the first question.

    Gates (any failure raises and prevents session creation):

    1. ``equipment_kb`` row must exist for ``cell_id`` (else
       :class:`NotFoundError` → 404).
    2. ``structured_data.thresholds`` must be non-empty (else
       :class:`ConflictError` → 409 — operator must upload a PDF first;
       otherwise the first vibration patch trips
       ``_assert_thresholds_cover_signal_keys`` at HTTP 500. See issue #19 §3).
    3. No active session may exist for the cell (else
       :class:`ConflictError` → 409).

    Returns:
        ``{session_id, cell_id, question_index: 0, question: str,
        total_questions: int}``.
    """
    session_store.cleanup_expired()

    async with db.pool.acquire() as conn:
        rec = await KbRepository(conn).get_by_cell(cell_id)
    if rec is None:
        raise NotFoundError(f"No equipment_kb row for cell {cell_id}")

    kb_data = decode_record(rec, JSON_FIELDS)
    structured = kb_data.get("structured_data") or {}
    if not structured or not structured.get("thresholds"):
        raise ConflictError(
            f"Upload a PDF manual first (POST /kb/equipment/{cell_id}/upload) "
            "before starting onboarding. The KB must have at least one threshold."
        )

    existing_sid = session_store.SESSIONS_BY_CELL.get(cell_id)
    if existing_sid and existing_sid in session_store.SESSIONS:
        raise ConflictError(
            f"Onboarding already in progress for cell {cell_id} "
            f"(session {existing_sid}). Complete or wait for TTL to expire."
        )

    session_id = str(uuid.uuid4())
    session = OnboardingSession(session_id=session_id, cell_id=cell_id)
    session_store.SESSIONS[session_id] = session
    session_store.SESSIONS_BY_CELL[cell_id] = session_id
    log.info("onboarding: started session=%s cell=%d", session_id, cell_id)

    first = QUESTIONS[0]
    # Render Q1 with the manufacturer's vibration threshold extracted from the
    # PDF — that single value is the "aha" moment of scene 1 (operator sees
    # the spec, gives their observed value, ARIA recalibrates).
    question_text = first["text"].format(
        mfr_value=_format_vibration_value(structured.get("thresholds") or {})
    )
    return {
        "session_id": session_id,
        "cell_id": cell_id,
        "question_index": first["index"],
        "question": question_text,
        "total_questions": len(QUESTIONS),
    }


async def submit_onboarding_message(session_id: str, answer: str) -> dict[str, Any]:
    """Process one operator answer and advance the session.

    Pipeline per question:

    1. Resolve session (drop if expired).
    2. Look up the current question's ``patch_hint``.
    3. :func:`~agents.kb_builder.onboarding.extraction.extract_patch` —
       Sonnet w/ Pydantic validation + 1 retry.
    4. ``mcp_client.call_tool("update_equipment_kb", ...)`` with
       ``source="onboarding"`` and ``calibrated_by="operator"``. On the final
       question (index ``len(QUESTIONS) - 1``) we also pass
       ``onboarding_complete=True`` so both the column and
       ``kb_meta.onboarding_complete`` flip — Sentinel (M4.2) keys off this.
    5. Return either the next question or ``{complete: True, kb: ...}``.

    The session record is dropped from the store once Q4 succeeds. If Sonnet
    extraction fails twice or the MCP write errors, the session stays at the
    same ``question_index`` so the operator can re-answer.

    Args:
        session_id: ID returned by :func:`start_onboarding`.
        answer: Free-text operator answer.

    Returns:
        Either ``{session_id, question_index, question, total_questions}`` or
        ``{session_id, complete: True, kb: dict}``.

    Raises:
        NotFoundError: When the session id is unknown or has expired.
        ValueError | ValidationError: When Sonnet keeps emitting bad JSON.
        ValidationFailedError: When the MCP write fails or the session is
            already past Q4.
    """
    session_store.cleanup_expired()

    session = session_store.SESSIONS.get(session_id)
    if session is None:
        raise NotFoundError(
            f"Onboarding session {session_id} not found or expired (TTL "
            f"{session_store.SESSION_TTL // 60} min)"
        )

    if session.question_index >= len(QUESTIONS):
        # Defensive: a completed session should already be dropped, but if a
        # client races two /message calls we surface a clear error instead of
        # an IndexError on QUESTIONS.
        session_store.drop(session)
        raise ValidationFailedError(
            f"Session {session_id} already completed all {len(QUESTIONS)} questions"
        )

    question = QUESTIONS[session.question_index]
    is_final = session.question_index == len(QUESTIONS) - 1

    # Step 1 — extract structured patch (may raise ValidationError after retry).
    patch = await extract_patch(answer, question["patch_hint"], session.cell_id)

    # Step 2 — write via MCP (the only sanctioned write path).
    tool_args: dict[str, Any] = {
        "cell_id": session.cell_id,
        "structured_data_patch": patch,
        "source": "onboarding",
        "calibrated_by": "operator",
    }
    if is_final:
        tool_args["onboarding_complete"] = True

    result = await mcp_client.call_tool("update_equipment_kb", tool_args)
    if result.is_error:
        # Keep the session at the same question_index so the operator can
        # re-answer. Surface the tool's own message for debuggability.
        raise ValidationFailedError(
            f"KB update failed for cell {session.cell_id}: {result.content}"
        )

    # Record the exchange and advance.
    session.messages.append(
        {"question_index": session.question_index, "answer": answer, "patch": patch}
    )
    session.question_index += 1

    if is_final:
        # Re-read the row through the repository so the response shape matches
        # ``EquipmentKbOut`` (the router serialises it for the client).
        async with db.pool.acquire() as conn:
            rec = await KbRepository(conn).get_by_cell(session.cell_id)
        session_store.drop(session)
        log.info("onboarding: completed session=%s cell=%d", session_id, session.cell_id)
        if rec is None:
            # Should be impossible — update_equipment_kb just returned success.
            raise NotFoundError(f"No equipment_kb row for cell {session.cell_id} after onboarding")
        return {
            "session_id": session_id,
            "complete": True,
            "kb": decode_record(rec, JSON_FIELDS),
        }

    next_q = QUESTIONS[session.question_index]
    return {
        "session_id": session_id,
        "question_index": next_q["index"],
        "question": next_q["text"],
        "total_questions": len(QUESTIONS),
    }
