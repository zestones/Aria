"""Investigator handoff helpers (#25 / M4.3, #30 / M5.1, #21 / M3.5).

Two outbound delegations:

- :func:`handle_ask_kb_builder` — dynamic handoff to the KB Builder
  ``answer_kb_question`` handler, emits ``agent_handoff`` + child
  ``agent_start``/``agent_end`` frames so the Activity Feed renders the
  delegation as a visible sub-turn.
- :func:`spawn_work_order_generator` — kicks off
  :func:`agents.work_order_generator.run_work_order_generator` as a
  background task once an RCA has been submitted.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from agents.work_order_generator import run_work_order_generator
from core.ws_manager import ws_manager

log = logging.getLogger("aria.investigator")


async def handle_ask_kb_builder(args: dict[str, Any], parent_turn_id: str) -> tuple[str, bool]:
    """Dynamic handoff to ``answer_kb_question`` (M3.5, issue #21).

    Broadcasts ``agent_handoff`` + ``agent_start`` (child turn) +
    ``agent_end`` so the frontend Activity Feed / Agent Inspector shows
    the delegation as a visible sub-turn.
    """
    from agents.kb_builder import answer_kb_question

    question = str(args.get("question", ""))
    try:
        cell_id = int(args.get("cell_id"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return (
            json.dumps({"answer": "cell_id missing or invalid", "source": None, "confidence": 0.0}),
            True,
        )

    await ws_manager.broadcast(
        "agent_handoff",
        {
            "from_agent": "investigator",
            "to_agent": "kb_builder",
            "reason": question,
            "turn_id": parent_turn_id,
        },
    )
    child_turn_id = uuid.uuid4().hex
    await ws_manager.broadcast("agent_start", {"agent": "kb_builder", "turn_id": child_turn_id})
    try:
        answer = await answer_kb_question(cell_id, question)
        is_error = False
    except (
        Exception
    ) as exc:  # noqa: BLE001 — answer_kb_question is never-raising per its contract; defense in depth
        log.warning("ask_kb_builder handoff failed: %s", exc)
        answer = {
            "answer": f"handoff failed: {type(exc).__name__}",
            "source": None,
            "confidence": 0.0,
        }
        is_error = True
    await ws_manager.broadcast(
        "agent_end",
        {
            "agent": "kb_builder",
            "turn_id": child_turn_id,
            "finish_reason": "answered" if not is_error else "error",
        },
    )
    return json.dumps(answer), is_error


def spawn_work_order_generator(work_order_id: int) -> None:
    """Kick off the Work Order Generator (#30) in the background."""
    asyncio.create_task(
        run_work_order_generator(work_order_id),
        name=f"work-order-gen-wo-{work_order_id}",
    )
