"""Demo-only routes — mounted in ``main.py`` only when ``ARIA_DEMO_ENABLED=true``.

Issue #29 (M4.7 — Memory flex scene). Provides an idempotent, re-playable
endpoint that:

1. Clears any recent ``failure_history`` for the target cell (so the scene
   can be re-triggered during demo rehearsal without accumulating rows).
2. Seeds one past failure dated 3 months ago with a ``signal_patterns``
   JSON matching the current anomaly the operator is about to inject.
3. Cancels any still-open agent-generated work order on the cell (so
   Sentinel's per-WO debounce window does not swallow the fresh anomaly).
4. Inserts a short burst of high-vibration readings into
   ``process_signal_data`` so Sentinel's next 30-second tick opens a
   ``work_order(status='detected')`` and spawns the Investigator.

The Investigator then loads ``get_failure_history(cell_id, limit=5)`` on
startup (#25) and — if the current signal pattern matches the seeded past
failure — cites it in ``submit_rca.similar_past_failure``. That chain is
the "knowledge doesn't retire" demo scene.

Intentionally throwaway: this router is kept separate from production
routers, guarded by an env flag, and carries no Pydantic schemas outside
the inline response dict. Do not import from it in production code.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import asyncpg
from core.database import get_db
from core.security import get_current_user
from fastapi import APIRouter, Body, Depends, HTTPException

log = logging.getLogger("aria.demo")

router = APIRouter(
    prefix="/api/v1/demo",
    tags=["demo"],
    dependencies=[Depends(get_current_user)],
)


_PAST_FAILURE_PATTERN: dict[str, Any] = {"vibration_mm_s": {"peak": 5.4, "duration_min": 14}}
# Short burst of readings — 5 x 30s apart, each above the 4.5 mm/s alert
# threshold seeded in migration 007's P-02 KB. Sentinel's 5-minute window
# captures all of them.
_FRESH_READINGS = [5.05, 5.12, 5.18, 5.22, 5.15]


@router.post("/trigger-memory-scene")
async def trigger_memory_scene(
    cell_name: str = Body("P-02", embed=True),
    conn: asyncpg.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Prime the "memory flex" demo scene — see module docstring.

    Safe to call repeatedly: step 1 clears prior scene state and step 3
    cancels any open agent WO so Sentinel's debounce is reset.
    """
    cell_row = await conn.fetchrow("SELECT id FROM cell WHERE name = $1", cell_name)
    if cell_row is None:
        raise HTTPException(status_code=404, detail=f"cell {cell_name!r} not found")
    cell_id: int = cell_row["id"]

    # Find the signal def that maps to vibration_mm_s — must exist for the
    # Sentinel → Investigator chain to pick up the injected readings.
    sig_row = await conn.fetchrow(
        """
        SELECT id FROM process_signal_definition
        WHERE cell_id = $1 AND kb_threshold_key = 'vibration_mm_s'
        LIMIT 1
        """,
        cell_id,
    )
    if sig_row is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"cell {cell_name!r} has no process_signal_definition with "
                "kb_threshold_key='vibration_mm_s'"
            ),
        )
    signal_def_id: int = sig_row["id"]

    async with conn.transaction():
        # 1. Clear recent failure_history so the seeded past-failure is the
        #    only one the Investigator sees from the last week.
        await conn.execute(
            "DELETE FROM failure_history WHERE cell_id = $1 "
            "AND failure_time > NOW() - INTERVAL '7 days'",
            cell_id,
        )

        # 2. Insert the past-failure row at t-3 months. `encode_fields` is
        #    overkill here — raw jsonb literal is fine in a demo route.
        past_row = await conn.fetchrow(
            """
            INSERT INTO failure_history (
                cell_id, failure_time, resolved_time,
                failure_mode, root_cause, signal_patterns
            ) VALUES (
                $1,
                NOW() - INTERVAL '3 months',
                NOW() - INTERVAL '3 months' + INTERVAL '4 hours',
                'bearing_wear',
                'Discharge bearing wear near end-of-life — replaced under PM-2026-01-18.',
                $2::jsonb
            )
            RETURNING id
            """,
            cell_id,
            json.dumps(_PAST_FAILURE_PATTERN),
        )
        past_failure_id: int = past_row["id"] if past_row is not None else 0

        # 3. Cancel any still-open agent-generated WO on this cell so the
        #    Sentinel per-(cell, signal) debounce window does not swallow
        #    the fresh anomaly. `detected` and `analyzed` are the statuses
        #    that block detection per M4.2.
        cancelled = await conn.execute(
            """
            UPDATE work_order
               SET status = 'cancelled', completed_at = NOW()
             WHERE cell_id = $1
               AND generated_by_agent = TRUE
               AND status IN ('detected', 'analyzed', 'open', 'in_progress')
            """,
            cell_id,
        )

        # 4. Seed a burst of high-vibration readings backdated 1..5 minutes.
        #    Sentinel's 5-minute look-back will pick them up on the next tick.
        for i, value in enumerate(_FRESH_READINGS):
            await conn.execute(
                """
                INSERT INTO process_signal_data (time, cell_id, signal_def_id, raw_value)
                VALUES (NOW() - (INTERVAL '30 seconds' * $1), $2, $3, $4)
                ON CONFLICT (time, signal_def_id) DO NOTHING
                """,
                len(_FRESH_READINGS) - i,
                cell_id,
                signal_def_id,
                value,
            )

    log.info(
        "memory-scene triggered cell=%s cell_id=%d past_failure_id=%d "
        "signal_def_id=%d readings=%d cancelled_wos=%s",
        cell_name,
        cell_id,
        past_failure_id,
        signal_def_id,
        len(_FRESH_READINGS),
        cancelled,
    )

    return {
        "ok": True,
        "cell_id": cell_id,
        "cell_name": cell_name,
        "past_failure_id": past_failure_id,
        "signal_def_id": signal_def_id,
        "readings_inserted": len(_FRESH_READINGS),
        # Sentinel tick is 30s; worst-case latency = one full tick + DB roundtrip.
        "expect_anomaly_within_seconds": 35,
    }
