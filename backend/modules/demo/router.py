"""Demo-only routes — mounted in ``main.py`` only when ``ARIA_DEMO_ENABLED=true``.

Issue #29 (M4.7 — Memory flex scene) shipped the first endpoint here —
``/trigger-memory-scene`` — which seeds a past failure and injects a
burst of breaching readings so Sentinel fires the memory-recall arc.

Issue #54 (M9.4 — E2E demo rehearsal) extends the same router with four
scene-orchestration endpoints that make the full 3-minute video
reproducible without hand-typing SQL between takes:

- ``/reset/light``          — clear open WOs, recent readings, forecast debounce.
- ``/scene/seed-forecast``  — inject 40 clean drift samples so forecast-watch fires.
- ``/scene/trigger-breach`` — inject 5 above-threshold samples so Sentinel fires.
- ``/scene/run-full``       — fire-and-forget chain of the three scenes above
                              plus ``/trigger-memory-scene`` on a sibling cell.

Intentionally throwaway: this router is kept separate from production
routers, guarded by an env flag, and carries no Pydantic schemas outside
the inline response dict. Do not import from it in production code.

**Scope note.** Schema, migrations, and seed SQL are user-owned (see
``docs/planning/M9-polish-e2e/demo-build-spec.md §2.1``). These endpoints
assume the user's seed has produced at least one onboarded cell with a
``kb_threshold_key='vibration_mm_s'`` signal; they fail fast (404 / 400)
otherwise.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import asyncpg
from core.database import db, get_db
from core.security import get_current_user
from fastapi import APIRouter, Body, Depends, HTTPException

log = logging.getLogger("aria.demo")

router = APIRouter(
    prefix="/api/v1/demo",
    tags=["demo"],
    dependencies=[Depends(get_current_user)],
)


# ---------------------------------------------------------------------------
# Memory-scene (existing — #29 / M4.7)
# ---------------------------------------------------------------------------


_PAST_FAILURE_PATTERN: dict[str, Any] = {"vibration_mm_s": {"peak": 5.4, "duration_min": 14}}
# Short burst of readings — 5 x 30s apart, each above the 4.5 mm/s alert
# threshold (ISO 10816-7 class II, the default seeded for the demo cell).
# Sentinel's 5-minute window captures all of them.
_FRESH_READINGS = [5.05, 5.12, 5.18, 5.22, 5.15]


@router.post("/trigger-memory-scene")
async def trigger_memory_scene(
    cell_name: str = Body("Bottle Capper", embed=True),
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


# ---------------------------------------------------------------------------
# M9.4 — scene orchestration (#54)
#
# The four endpoints below are helpers-plus-routes: each route defers to a
# free ``_do_*`` helper so ``run_full`` can chain them in-process without
# an HTTP round trip. The helpers take an explicit connection so they run
# inside the caller's transaction scope when invoked from another handler,
# or grab their own pool-acquired connection when invoked directly from
# ``run_full``.
# ---------------------------------------------------------------------------


# How many drift samples ``seed-forecast`` injects. Forecast-watch requires
# ``>= 20`` and ``R² >= 0.35`` to fire (see ``agents.sentinel.forecast``);
# 40 samples over a clean linear ramp satisfies both by wide margins.
_SEED_FORECAST_SAMPLE_COUNT = 40
# Window length over which the samples are spaced. Forecast-watch's
# regression window is 6h; 6h of 30-second samples → 720 points, but we
# only need the regression floor, so 40 points over 6h is plenty.
_SEED_FORECAST_WINDOW_HOURS = 6.0

# Spike burst for trigger-breach — five readings above threshold, 30s
# apart, backdated 1-5 min so Sentinel's 5-minute look-back grabs them.
_TRIGGER_BREACH_COUNT = 5
_TRIGGER_BREACH_MULTIPLIERS = [1.05, 1.08, 1.12, 1.16, 1.22]

# Fallback alert threshold when the KB carries no ``alert`` key for the
# vibration signal. Matches the ISO 10816-7 class-II operator-intervention
# line — overridden by the KB when present.
_FALLBACK_VIBRATION_ALERT_MM_S = 4.5


async def _resolve_cell_and_vibration(
    conn: asyncpg.Connection, cell_name: str
) -> tuple[int, int, float]:
    """Look up (cell_id, signal_def_id, alert_threshold) for the cell's
    vibration signal. Raises ``HTTPException`` on failure — the demo
    endpoints bail on any of 404 / 400 / missing threshold.
    """
    cell_row = await conn.fetchrow("SELECT id FROM cell WHERE name = $1", cell_name)
    if cell_row is None:
        raise HTTPException(status_code=404, detail=f"cell {cell_name!r} not found")
    cell_id: int = cell_row["id"]

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

    # Thresholds live under ``equipment_kb.structured_data.thresholds.<key>``.
    # Tolerate a missing alert by falling back to the ISO-10816 default —
    # better to run the demo with a sane number than to 400.
    kb_row = await conn.fetchrow(
        "SELECT structured_data FROM equipment_kb WHERE cell_id = $1",
        cell_id,
    )
    alert_threshold = _FALLBACK_VIBRATION_ALERT_MM_S
    if kb_row is not None and kb_row["structured_data"] is not None:
        raw = kb_row["structured_data"]
        data: Any = raw if isinstance(raw, dict) else json.loads(raw)
        vib = (data.get("thresholds") or {}).get("vibration_mm_s") or {}
        candidate = vib.get("alert")
        if isinstance(candidate, (int, float)):
            alert_threshold = float(candidate)

    return cell_id, signal_def_id, alert_threshold


def _clear_forecast_debounce() -> int:
    """Wipe the forecast-watch in-memory debounce table.

    Module-level state — see ``agents.sentinel.forecast._forecast_last_emit``.
    Returns the number of entries removed so the response is informative.
    """
    # Late import to avoid a circular dependency between demo + sentinel at
    # module-load time (sentinel imports ``agents.investigator`` which
    # transitively touches FastAPI / app state — import only when needed).
    from agents.sentinel import forecast as forecast_mod

    n = len(forecast_mod._forecast_last_emit)
    forecast_mod._forecast_last_emit.clear()
    return n


# ---------------------------------------------------------------------------
# reset/light
# ---------------------------------------------------------------------------


async def _do_reset_light(conn: asyncpg.Connection) -> dict[str, Any]:
    """Cancel open agent WOs (recent), purge present-tense readings on any
    monitored vibration signal, clear the forecast-watch debounce.

    Does **not** touch the 7-day history, KB rows, or failure_history —
    those belong to the user's seed (see build spec §2.1).
    """
    async with conn.transaction():
        cancelled_tag = await conn.execute(
            """
            UPDATE work_order
               SET status = 'cancelled', completed_at = NOW()
             WHERE generated_by_agent = TRUE
               AND status IN ('detected', 'analyzed', 'open', 'in_progress')
               AND created_at > NOW() - INTERVAL '2 hours'
            """
        )
        # ``execute`` returns a tag like "UPDATE 3".
        cancelled = int(cancelled_tag.split()[-1]) if cancelled_tag else 0

        # Purge only the present-tense window so we don't nuke the user's
        # seeded history. 2h covers both seed-forecast's drift injection
        # and trigger-breach's spike burst.
        readings_tag = await conn.execute(
            """
            DELETE FROM process_signal_data
             WHERE time > NOW() - INTERVAL '2 hours'
               AND signal_def_id IN (
                   SELECT id FROM process_signal_definition
                    WHERE kb_threshold_key = 'vibration_mm_s'
               )
            """
        )
        readings_cleared = int(readings_tag.split()[-1]) if readings_tag else 0

    debounce_cleared = _clear_forecast_debounce()

    log.info(
        "demo reset/light: cancelled_wos=%d readings_cleared=%d debounce_cleared=%d",
        cancelled,
        readings_cleared,
        debounce_cleared,
    )

    return {
        "ok": True,
        "cancelled_work_orders": cancelled,
        "cleared_readings": readings_cleared,
        "cleared_forecast_debounce_entries": debounce_cleared,
    }


@router.post("/reset/light")
async def reset_light(
    conn: asyncpg.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Mid-demo recovery reset. Cheap and safe to call between takes."""
    return await _do_reset_light(conn)


# ---------------------------------------------------------------------------
# scene/seed-forecast
# ---------------------------------------------------------------------------


async def _do_seed_forecast(conn: asyncpg.Connection, cell_name: str) -> dict[str, Any]:
    """Inject 40 clean drift samples spanning the last 6 h on the target
    cell's vibration signal. Forecast-watch's next tick picks them up.

    Drift ramps from ``alert * 0.60`` to ``alert * 0.92`` — nowhere near
    the trip threshold, but easily enough slope for the regression to
    project a breach inside the 12 h horizon.
    """
    cell_id, signal_def_id, alert_threshold = await _resolve_cell_and_vibration(conn, cell_name)

    start_value = alert_threshold * 0.60
    end_value = alert_threshold * 0.92
    step = (end_value - start_value) / max(1, _SEED_FORECAST_SAMPLE_COUNT - 1)
    window_seconds = _SEED_FORECAST_WINDOW_HOURS * 3600.0
    interval_seconds = window_seconds / max(1, _SEED_FORECAST_SAMPLE_COUNT - 1)

    async with conn.transaction():
        # Wipe the same 6 h window for this signal so we don't collide with
        # whatever the user's seed put there. Forecast-watch regresses on
        # the last 6 h; a clean window = deterministic slope.
        await conn.execute(
            """
            DELETE FROM process_signal_data
             WHERE signal_def_id = $1
               AND time > NOW() - INTERVAL '6 hours 5 minutes'
            """,
            signal_def_id,
        )

        for i in range(_SEED_FORECAST_SAMPLE_COUNT):
            # i=0 is oldest (6 h ago), i=N-1 is most recent (few seconds ago).
            seconds_ago = window_seconds - (i * interval_seconds)
            value = start_value + (step * i)
            await conn.execute(
                """
                INSERT INTO process_signal_data (time, cell_id, signal_def_id, raw_value)
                VALUES (NOW() - (INTERVAL '1 second' * $1), $2, $3, $4)
                ON CONFLICT (time, signal_def_id) DO NOTHING
                """,
                seconds_ago,
                cell_id,
                signal_def_id,
                value,
            )

    # Clear any previous forecast debounce so the banner will re-fire even
    # if this is the second take in the same rehearsal.
    _clear_forecast_debounce()

    log.info(
        "demo seed-forecast: cell=%s cell_id=%d signal_def=%d samples=%d " "ramp=%.2f→%.2f mm/s",
        cell_name,
        cell_id,
        signal_def_id,
        _SEED_FORECAST_SAMPLE_COUNT,
        start_value,
        end_value,
    )

    return {
        "ok": True,
        "cell_id": cell_id,
        "cell_name": cell_name,
        "signal_def_id": signal_def_id,
        "samples_inserted": _SEED_FORECAST_SAMPLE_COUNT,
        "drift_start_value": round(start_value, 3),
        "drift_end_value": round(end_value, 3),
        "alert_threshold": round(alert_threshold, 3),
        # Forecast-watch ticks every 60s; worst case is one full tick.
        "expected_forecast_within_seconds": 60,
    }


@router.post("/scene/seed-forecast")
async def seed_forecast(
    target: str = Body("Bottle Filler", embed=True),
    conn: asyncpg.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Fire the predictive-forecast scene on the target cell.

    Default ``target`` aligns with the demo narrative's Bottle Filler;
    callers may pass any cell name from their seed. If the name doesn't
    resolve or the cell has no vibration signal, 404 / 400.
    """
    return await _do_seed_forecast(conn, target)


# ---------------------------------------------------------------------------
# scene/trigger-breach
# ---------------------------------------------------------------------------


async def _do_trigger_breach(conn: asyncpg.Connection, cell_name: str) -> dict[str, Any]:
    """Append 5 above-threshold samples so Sentinel fires on its next
    30 s tick. Also cancels any open agent WO on the (cell, signal) pair
    so Sentinel's debounce doesn't swallow the new anomaly.
    """
    cell_id, signal_def_id, alert_threshold = await _resolve_cell_and_vibration(conn, cell_name)

    async with conn.transaction():
        cancelled_tag = await conn.execute(
            """
            UPDATE work_order
               SET status = 'cancelled', completed_at = NOW()
             WHERE cell_id = $1
               AND triggered_by_signal_def_id = $2
               AND generated_by_agent = TRUE
               AND status IN ('detected', 'analyzed', 'open', 'in_progress')
               AND created_at > NOW() - INTERVAL '35 minutes'
            """,
            cell_id,
            signal_def_id,
        )
        cancelled = int(cancelled_tag.split()[-1]) if cancelled_tag else 0

        for i, multiplier in enumerate(_TRIGGER_BREACH_MULTIPLIERS):
            value = alert_threshold * multiplier
            # Backdate 30s * (N - i) so Sentinel's 5-min window captures them.
            slot = _TRIGGER_BREACH_COUNT - i
            await conn.execute(
                """
                INSERT INTO process_signal_data (time, cell_id, signal_def_id, raw_value)
                VALUES (NOW() - (INTERVAL '30 seconds' * $1), $2, $3, $4)
                ON CONFLICT (time, signal_def_id) DO NOTHING
                """,
                slot,
                cell_id,
                signal_def_id,
                value,
            )

    log.info(
        "demo trigger-breach: cell=%s cell_id=%d signal_def=%d readings=%d "
        "alert_threshold=%.2f cancelled_wos=%d",
        cell_name,
        cell_id,
        signal_def_id,
        _TRIGGER_BREACH_COUNT,
        alert_threshold,
        cancelled,
    )

    return {
        "ok": True,
        "cell_id": cell_id,
        "cell_name": cell_name,
        "signal_def_id": signal_def_id,
        "readings_inserted": _TRIGGER_BREACH_COUNT,
        "alert_threshold": round(alert_threshold, 3),
        "cancelled_work_orders": cancelled,
        # Sentinel ticks every 30s.
        "expect_anomaly_within_seconds": 35,
    }


@router.post("/scene/trigger-breach")
async def trigger_breach(
    target: str = Body("Bottle Filler", embed=True),
    conn: asyncpg.Connection = Depends(get_db),
) -> dict[str, Any]:
    """Fire the anomaly-breach scene on the target cell."""
    return await _do_trigger_breach(conn, target)


# ---------------------------------------------------------------------------
# scene/run-full
# ---------------------------------------------------------------------------


# Wall-clock pauses between chain steps. Sized so each scene's UI effect
# has time to land before the next scene trampolines the banner head slot.
_RUN_FULL_POST_FORECAST_SLEEP_S = 75
_RUN_FULL_POST_BREACH_SLEEP_S = 240


async def _run_full_chain(
    *,
    forecast_target: str,
    breach_target: str,
    memory_target: str,
) -> None:
    """Background task fired by ``/scene/run-full``. Acquires its own
    connection so the request that launched it can return 202 immediately.

    Each step catches its own exception and logs — one failure does not
    cancel the rest of the chain. This matches the "resilience over
    completeness" posture every long-running backend task in ARIA takes.
    """
    log.info(
        "demo run-full chain starting: forecast=%s breach=%s memory=%s",
        forecast_target,
        breach_target,
        memory_target,
    )
    try:
        async with db.pool.acquire() as conn:
            try:
                await _do_reset_light(conn)
            except Exception:  # noqa: BLE001 — chain must keep running
                log.exception("run-full: reset_light step failed")

            await asyncio.sleep(2)

            try:
                await _do_seed_forecast(conn, forecast_target)
            except Exception:  # noqa: BLE001
                log.exception("run-full: seed_forecast step failed")

        await asyncio.sleep(_RUN_FULL_POST_FORECAST_SLEEP_S)

        async with db.pool.acquire() as conn:
            try:
                await _do_trigger_breach(conn, breach_target)
            except Exception:  # noqa: BLE001
                log.exception("run-full: trigger_breach step failed")

        await asyncio.sleep(_RUN_FULL_POST_BREACH_SLEEP_S)

        async with db.pool.acquire() as conn:
            try:
                await trigger_memory_scene(cell_name=memory_target, conn=conn)
            except Exception:  # noqa: BLE001
                log.exception("run-full: trigger_memory_scene step failed")

        log.info("demo run-full chain completed")
    except asyncio.CancelledError:
        log.info("demo run-full chain cancelled")
        raise


@router.post("/scene/run-full", status_code=202)
async def run_full(
    forecast_target: str = Body("Bottle Filler", embed=True),
    breach_target: str = Body("Bottle Filler", embed=True),
    memory_target: str = Body("Bottle Capper", embed=True),
) -> dict[str, Any]:
    """Fire-and-forget the full demo chain.

    Returns 202 immediately; the chain runs for ~5-6 minutes in the
    background. Callers poll the normal telemetry surfaces (banner,
    work-order list, chat) to see scene progress — no polling endpoint
    for chain status; by design (resilience > observability for a demo).
    """
    asyncio.create_task(
        _run_full_chain(
            forecast_target=forecast_target,
            breach_target=breach_target,
            memory_target=memory_target,
        ),
        name="demo-run-full-chain",
    )
    total_seconds = 2 + _RUN_FULL_POST_FORECAST_SLEEP_S + _RUN_FULL_POST_BREACH_SLEEP_S + 35
    return {
        "ok": True,
        "chain_started": True,
        "forecast_target": forecast_target,
        "breach_target": breach_target,
        "memory_target": memory_target,
        "expected_total_duration_seconds": total_seconds,
    }
