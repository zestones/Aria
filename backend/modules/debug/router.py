"""Debug endpoints for the hackathon demo (J-2).

Exposes a single trigger that re-spawns the Investigator agent on an
existing work order so Adam can showcase Opus 4.7 extended thinking
live during the pitch without waiting for a natural Sentinel detection.
Also exposes a tiny listing endpoint so the frontend can grab the most
recent work order to replay.

Scope is intentionally throwaway — keep this module out of production
imports and remove post-demo. Auth stays on via `get_current_user` so
the existing cookie/session path is reused (the frontend calls through
Vite proxy with `credentials: "include"`).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import asyncpg
from agents.investigator.service import run_investigator
from core.database import get_db
from core.security import get_current_user
from fastapi import APIRouter, Depends, HTTPException

log = logging.getLogger("aria.debug")

router = APIRouter(
    prefix="/api/v1/debug",
    tags=["debug"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/replay-investigator/{work_order_id}", status_code=202)
async def replay_investigator(
    work_order_id: int,
    conn: asyncpg.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Re-spawn the full Investigator agent on an existing work order.

    Resets the WO status to ``detected`` first so the agent re-emits the
    full broadcast sequence (``agent_start`` → ``thinking_delta`` →
    ``tool_call_*`` → ``submit_rca`` → ``agent_end``). Returns 202 with
    the scheduled task identifier; the actual run happens in the
    background task.
    """
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

    # Fire-and-forget — the endpoint returns immediately so the UI can
    # start rendering `agent_start` as soon as the Investigator emits it.
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
