"""Debug endpoints for the hackathon demo (J-2).

Exposes a demo trigger that re-plays the full multi-agent flow on an
existing work order:

1. ``Sentinel`` broadcasts an ``anomaly_detected`` + ``ui_render(alert_banner)``
   — the operator console lights up with the red banner.
2. After a short dramatic pause, the ``Investigator`` agent spawns (Opus 4.7
   extended thinking + tool loop), streaming ``thinking_delta`` chunks + tool
   calls + render artifacts.
3. On ``submit_rca``, the Investigator auto-chains the ``Work Order Generator``
   which enriches the work order with recommended actions, parts, and skills.
4. Optionally the Investigator hands off to the KB Builder via ``ask_kb_builder``
   when it needs a threshold lookup — that handoff is already wired upstream,
   we don't force it.

The demo button on the frontend calls ``POST /api/v1/debug/replay-full-flow/{id}``
to trigger the whole chain on cue. Also exposes a listing endpoint so the UI can
pick the most recent WO to replay.

Scope is intentionally throwaway — keep this module out of production imports
and remove post-demo. Auth stays on via ``get_current_user`` so the existing
cookie/session path is reused (the frontend calls through Vite proxy with
``credentials: "include"``).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

import asyncpg
from agents.investigator.service import run_investigator
from core.database import get_db
from core.security import get_current_user
from core.ws_manager import ws_manager
from fastapi import APIRouter, Depends, HTTPException

log = logging.getLogger("aria.debug")

router = APIRouter(
    prefix="/api/v1/debug",
    tags=["debug"],
    dependencies=[Depends(get_current_user)],
)


async def _replay_full_flow(work_order_id: int, cell_id: int, cell_name: str) -> None:
    """Background task running the full demo choreography.

    Done as a separate coroutine so the HTTP endpoint returns 202 immediately
    while the dramatic Sentinel → Investigator → Work Order Generator chain
    plays out for the audience.
    """
    try:
        # Replay the Sentinel banner as if a fresh anomaly just fired. The
        # turn_id here is cosmetic — it correlates the anomaly_detected and
        # alert_banner frames for the Activity Feed row.
        sentinel_turn = uuid.uuid4().hex
        await ws_manager.broadcast(
            "anomaly_detected",
            {
                "cell_id": cell_id,
                "signal_def_id": 0,
                "value": 0.0,
                "threshold": 0.0,
                "work_order_id": work_order_id,
                "time": "",
                "severity": "alert",
                "direction": "high",
            },
        )
        await ws_manager.broadcast(
            "ui_render",
            {
                "agent": "sentinel",
                "component": "alert_banner",
                "props": {
                    "cell_id": cell_id,
                    "severity": "alert",
                    "message": (
                        f"{cell_name}: anomaly replay triggered "
                        f"— investigator dispatched"
                    ),
                    "anomaly_id": work_order_id,
                },
                "turn_id": sentinel_turn,
            },
        )
        # Dramatic pause so the operator console can register the banner +
        # activity feed row before the Investigator starts typing.
        await asyncio.sleep(1.5)

        # Spawn the full Investigator loop. It will:
        #  - broadcast agent_start(investigator)
        #  - stream thinking_delta chunks (Opus 4.7 extended thinking)
        #  - tool_call_started / completed for get_signal_trend, get_equipment_kb,
        #    get_failure_history, get_signal_anomalies, render_*, submit_rca…
        #  - on submit_rca, auto-chain spawn_work_order_generator which drives
        #    its own turn (agent_start(work_order_generator) → tool loop →
        #    submit_work_order → agent_end)
        #  - optionally agent_handoff to kb_builder via ask_kb_builder
        await run_investigator(work_order_id)
    except Exception:  # noqa: BLE001 — this is a background task, never re-raise
        log.exception("debug replay full flow failed for WO %d", work_order_id)


@router.post("/replay-full-flow/{work_order_id}", status_code=202)
async def replay_full_flow(
    work_order_id: int,
    conn: asyncpg.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Re-play the full demo flow on an existing work order.

    Resets the WO status to ``detected`` first so the agent pipeline can walk
    through the full broadcast sequence. Returns 202 immediately; the actual
    choreography (Sentinel banner → Investigator thinking+tools → Work Order
    Generator) runs in the background.
    """
    wo = await conn.fetchrow(
        """
        SELECT wo.id, wo.cell_id, wo.status, wo.title, c.name AS cell_name
        FROM work_order wo
        JOIN cell c ON c.id = wo.cell_id
        WHERE wo.id = $1
        """,
        work_order_id,
    )
    if wo is None:
        raise HTTPException(
            status_code=404, detail=f"work_order {work_order_id} not found"
        )

    # Wipe prior RCA + enrichment so the agents have fresh work to do and the
    # audience sees the work order populate from scratch during the demo.
    await conn.execute(
        """
        UPDATE work_order
        SET status = 'detected',
            rca_summary = NULL,
            recommended_actions = NULL,
            required_parts = NULL,
            required_skills = NULL,
            estimated_duration_min = NULL
        WHERE id = $1
        """,
        work_order_id,
    )

    asyncio.create_task(
        _replay_full_flow(
            work_order_id=work_order_id,
            cell_id=wo["cell_id"],
            cell_name=wo["cell_name"],
        ),
        name=f"debug-full-flow-wo-{work_order_id}",
    )
    log.info(
        "debug replay-full-flow: spawned for WO %d (cell %d %s, prior status %s)",
        work_order_id,
        wo["cell_id"],
        wo["cell_name"],
        wo["status"],
    )
    return {
        "work_order_id": work_order_id,
        "cell_id": wo["cell_id"],
        "cell_name": wo["cell_name"],
        "previous_status": wo["status"],
        "title": wo["title"],
        "spawned": True,
    }


# Kept for backward compatibility with the previous button wiring — it still
# does the core Investigator replay without the Sentinel pre-roll. The frontend
# is expected to use /replay-full-flow/{id} for the demo pitch.
@router.post("/replay-investigator/{work_order_id}", status_code=202)
async def replay_investigator(
    work_order_id: int,
    conn: asyncpg.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Re-spawn the full Investigator agent on an existing work order (legacy)."""
    wo = await conn.fetchrow(
        "SELECT id, cell_id, status FROM work_order WHERE id = $1",
        work_order_id,
    )
    if wo is None:
        raise HTTPException(
            status_code=404, detail=f"work_order {work_order_id} not found"
        )

    await conn.execute(
        "UPDATE work_order SET status = 'detected' WHERE id = $1",
        work_order_id,
    )

    asyncio.create_task(
        run_investigator(work_order_id),
        name=f"debug-investigator-wo-{work_order_id}",
    )
    log.info(
        "debug replay: Investigator spawned for WO %d (cell %d, prior status %s)",
        work_order_id,
        wo["cell_id"],
        wo["status"],
    )
    return {
        "work_order_id": work_order_id,
        "cell_id": wo["cell_id"],
        "previous_status": wo["status"],
        "spawned": True,
    }


@router.get("/recent-work-orders")
async def recent_work_orders(
    limit: int = 10,
    conn: asyncpg.Connection = Depends(get_db),
) -> list[dict[str, Any]]:
    """List recent work orders for the demo trigger UI (newest first)."""
    limit = max(1, min(limit, 100))
    rows = await conn.fetch(
        """
        SELECT id, cell_id, status, title, created_at
        FROM work_order
        ORDER BY created_at DESC
        LIMIT $1
        """,
        limit,
    )
    return [dict(r) for r in rows]
