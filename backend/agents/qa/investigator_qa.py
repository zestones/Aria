"""Q&A → Investigator diagnostic fast path (``ask_investigator`` tool).

:func:`answer_investigator_question` is the short deterministic handler
backing the ``ask_investigator`` agent-only tool. It mirrors
:func:`agents.kb_builder.qa.answer_kb_question` in contract:

- Returns a dict on every path. Never raises.
- No WS broadcasts, no DB writes (the caller owns handoff frames).
- Always Sonnet — ``ARIA_MODEL=opus`` must not 10x the cost of a simple
  lookup.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from agents.anthropic_client import anthropic, model_for, parse_json_response
from agents.qa.prompts import INVESTIGATOR_QA_SYSTEM
from core.database import db

log = logging.getLogger("aria.qa_agent")


async def answer_investigator_question(cell_id: int, question: str) -> dict[str, Any]:
    """Answer a diagnostic question from the Q&A agent.

    Short deterministic path — does NOT spawn a full ``run_investigator``
    run. Reads recent work orders with an RCA and past failures for the
    cell, asks Sonnet to answer in JSON.

    Returned dict shape
    -------------------
    ``{"answer": str, "cited_work_order_ids": list[int],
       "cited_failure_ids": list[int], "confidence": float}``
    """
    try:
        context = await _collect_diagnostic_context(cell_id)
    except Exception as exc:  # noqa: BLE001 — safe fallback for the tool loop
        log.warning("ask_investigator context load failed for cell %d: %s", cell_id, exc)
        return {
            "answer": f"Diagnostic context unavailable for cell {cell_id}.",
            "cited_work_order_ids": [],
            "cited_failure_ids": [],
            "confidence": 0.0,
        }

    try:
        response = await anthropic.messages.create(
            model=model_for("chat"),
            max_tokens=1024,
            system=INVESTIGATOR_QA_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Recent work orders for cell {cell_id}:\n"
                        f"{json.dumps(context['work_orders'], default=str)}\n\n"
                        f"Past failures for cell {cell_id}:\n"
                        f"{json.dumps(context['failures'], default=str)}\n\n"
                        f"Question: {question}"
                    ),
                }
            ],
        )
        parsed = parse_json_response(response)
    except Exception as exc:  # noqa: BLE001 — safe fallback for the tool loop
        log.warning("ask_investigator LLM call failed for cell %d: %s", cell_id, exc)
        return {
            "answer": "Diagnostic query failed — information unavailable.",
            "cited_work_order_ids": [],
            "cited_failure_ids": [],
            "confidence": 0.0,
        }

    # Best-effort normalisation — the LLM may skip optional fields.
    return {
        "answer": str(parsed.get("answer") or ""),
        "cited_work_order_ids": list(parsed.get("cited_work_order_ids") or []),
        "cited_failure_ids": list(parsed.get("cited_failure_ids") or []),
        "confidence": float(parsed.get("confidence") or 0.0),
    }


async def _collect_diagnostic_context(cell_id: int) -> dict[str, Any]:
    """Pull a small window of recent RCAs + past failures for the cell."""
    async with db.pool.acquire() as conn:
        wo_rows = await conn.fetch(
            """
            SELECT id, status, priority, title, rca_summary, created_at
              FROM work_order
             WHERE cell_id = $1 AND rca_summary IS NOT NULL
             ORDER BY created_at DESC
             LIMIT 5
            """,
            cell_id,
        )
        fh_rows = await conn.fetch(
            """
            SELECT id, failure_time, failure_mode, root_cause
              FROM failure_history
             WHERE cell_id = $1
             ORDER BY failure_time DESC
             LIMIT 5
            """,
            cell_id,
        )
    return {
        "work_orders": [dict(r) for r in wo_rows],
        "failures": [dict(r) for r in fh_rows],
    }
