"""Sentinel — 30s threshold-breach detection loop.

Issue #24 (M4.2). Opens a ``work_order(status='detected')`` on breach,
broadcasts ``anomaly_detected`` + ``ui_render(alert_banner)``, and spawns
the Investigator agent (#25) in the background.

The loop runs forever, started by the FastAPI lifespan (#26). Each tick
wraps its body in ``try/except`` so a single bad cell cannot kill the
entire asyncio Task — the loop must survive any transient tool or DB
error so detection resumes on the next 30s tick.

Threshold evaluation is delegated to ``get_signal_anomalies`` (M2.3),
which internally calls :func:`core.thresholds.evaluate_threshold` and
handles both single-sided (``alert`` / ``trip``) and double-sided
(``low_alert`` / ``high_alert``) shapes identically. Sentinel only
consumes the structured breach list and never interprets raw thresholds
itself — this keeps the detection contract in one place.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from aria_mcp.client import mcp_client
from core.database import db
from core.db_helpers import must
from core.ws_manager import ws_manager
from modules.work_order.repository import WorkOrderRepository

log = logging.getLogger("aria.sentinel")

_TICK_SECONDS = 30
_WINDOW_MINUTES = 5
_DEBOUNCE_MINUTES = 30

# Module-level flag — emit the "watching / ignored" summary exactly once at
# first tick so the Docker logs carry a stable startup fingerprint without
# being spammed every 30s.
_logged_cells = False


async def sentinel_loop() -> None:
    """Run forever. Wraps each tick in try/except so the loop never dies."""
    log.info("Sentinel started")
    while True:
        try:
            await _sentinel_tick()
        except Exception:  # noqa: BLE001 — outer loop must survive any tick-level error
            log.exception("Sentinel tick failed — continuing")
        await asyncio.sleep(_TICK_SECONDS)


async def _sentinel_tick() -> None:
    """One detection pass over every onboarded cell."""
    global _logged_cells

    async with db.pool.acquire() as conn:
        cell_rows = await conn.fetch(
            """
            SELECT k.cell_id, c.name AS cell_name, k.onboarding_complete
            FROM equipment_kb k
            JOIN cell c ON c.id = k.cell_id
            ORDER BY k.cell_id
            """
        )

    if not _logged_cells:
        watched = [r["cell_id"] for r in cell_rows if r["onboarding_complete"]]
        ignored = [r["cell_id"] for r in cell_rows if not r["onboarding_complete"]]
        log.info(
            "Sentinel watching cells: %s  |  ignored (no KB / not onboarded): %s",
            watched,
            ignored,
        )
        _logged_cells = True

    now = datetime.now(timezone.utc)
    window_start = (now - timedelta(minutes=_WINDOW_MINUTES)).isoformat()
    window_end = now.isoformat()

    for row in cell_rows:
        if not row["onboarding_complete"]:
            continue
        await _check_cell(
            cell_id=row["cell_id"],
            cell_name=row["cell_name"],
            window_start=window_start,
            window_end=window_end,
        )


async def _check_cell(*, cell_id: int, cell_name: str, window_start: str, window_end: str) -> None:
    """Check one cell for breaches and handle each unique-signal breach."""
    result = await mcp_client.call_tool(
        "get_signal_anomalies",
        {"cell_id": cell_id, "window_start": window_start, "window_end": window_end},
    )
    if result.is_error:
        # KB misconfigured (no thresholds / no kb_threshold_key matches). Skip
        # this cell for this tick — a fix to the KB flips it back on without
        # restarting Sentinel.
        log.warning("get_signal_anomalies error for cell %d: %s", cell_id, result.content)
        return

    try:
        breaches = json.loads(result.content) if result.content else []
    except json.JSONDecodeError:
        log.warning("get_signal_anomalies returned non-JSON for cell %d", cell_id)
        return

    # FastMCP wraps non-Pydantic returns (here: list[dict]) as
    # ``{"result": [...]}`` in ``structured_content``; the client stringifies
    # that as-is. Unwrap so ``for breach in breaches`` iterates rows, not dict
    # keys. Scoped to Sentinel on purpose — a transversal unwrap in
    # ``aria_mcp.client`` would silently change every other caller's payload
    # mid-hackathon.
    if isinstance(breaches, dict) and list(breaches.keys()) == ["result"]:
        breaches = breaches["result"]

    if not breaches:
        return

    # Within one tick, only act on the first breach per signal_def_id — later
    # readings of the same signal in the same 5-min window would just produce
    # duplicate work orders. Cross-tick debounce is handled by the DB query
    # in :func:`_handle_breach`.
    seen_signals: set[int] = set()
    for breach in breaches:
        signal_def_id = breach["signal_def_id"]
        if signal_def_id in seen_signals:
            continue
        seen_signals.add(signal_def_id)
        await _handle_breach(cell_id=cell_id, cell_name=cell_name, breach=breach)


async def _handle_breach(*, cell_id: int, cell_name: str, breach: dict[str, Any]) -> None:
    """Open a work_order on the first fresh breach and broadcast the event.

    Debounce rule: if any open work_order for the same (cell, signal) was
    created in the last 30 minutes, skip. The DB is the source of truth so
    the debounce window survives Sentinel restarts — and a human closing
    the WO (``status='completed'``/``'cancelled'``) re-enables detection
    immediately.
    """
    signal_def_id: int = breach["signal_def_id"]

    async with db.pool.acquire() as conn:
        existing = await conn.fetchval(
            """
            SELECT 1
            FROM work_order
            WHERE cell_id = $1
              AND triggered_by_signal_def_id = $2
              AND created_at > NOW() - INTERVAL '30 minutes'
              AND status NOT IN ('completed', 'cancelled')
            LIMIT 1
            """,
            cell_id,
            signal_def_id,
        )
        if existing:
            log.debug(
                "Sentinel debounced cell=%d signal=%d — open WO in last 30 min",
                cell_id,
                signal_def_id,
            )
            return

        wo = must(
            await WorkOrderRepository(conn).create(
                {
                    "cell_id": cell_id,
                    "status": "detected",
                    "priority": "high",
                    "title": f"Anomaly detected — {breach['display_name']}",
                    "generated_by_agent": True,
                    "trigger_anomaly_time": datetime.fromisoformat(breach["breach_start"]),
                    "triggered_by_signal_def_id": signal_def_id,
                }
            ),
            what="work_order row just inserted",
        )

    wo_id: int = wo["id"]

    # turn_id correlates the anomaly_detected + alert_banner frames in the
    # frontend Activity Feed / Agent Inspector. Sentinel runs outside an
    # agent turn so it mints a fresh id here rather than reading the
    # WSManager ContextVar (which is reserved for actual agent turns).
    turn_id = uuid.uuid4().hex

    await ws_manager.broadcast(
        "anomaly_detected",
        {
            "cell_id": cell_id,
            "signal_def_id": signal_def_id,
            "value": breach["peak_value"],
            "threshold": breach["threshold_value"],
            "work_order_id": wo_id,
            "time": breach["breach_start"],
            "severity": breach["severity"],
            "direction": breach["direction"],
        },
    )
    await ws_manager.broadcast(
        "ui_render",
        {
            "agent": "sentinel",
            "component": "alert_banner",
            "props": {
                "cell_id": cell_id,
                "severity": breach["severity"],
                "message": (
                    f"{cell_name}: {breach['display_name']} = {breach['peak_value']} "
                    f"({breach['threshold_field']} {breach['threshold_value']})"
                ),
                "anomaly_id": wo_id,
            },
            "turn_id": turn_id,
        },
    )

    # Make the Sentinel → Investigator delegation visible in the Activity
    # Feed / Agent Constellation. The Investigator runs in a background
    # task with its own turn_id; this handoff frame just signals intent so
    # the frontend can render the edge between the two agents.
    await ws_manager.broadcast(
        "agent_handoff",
        {
            "from_agent": "sentinel",
            "to_agent": "investigator",
            "reason": (
                f"{breach['display_name']} on {cell_name} = {breach['peak_value']} "
                f"({breach['threshold_field']} {breach['threshold_value']}) — investigate root cause"
            ),
            "turn_id": turn_id,
        },
    )

    _spawn_investigator(wo_id)


def _spawn_investigator(work_order_id: int) -> None:
    """Kick off the Investigator agent in the background.

    Lazy import: #25 will ship ``agents.investigator.run_investigator``.
    Until then the ImportError branch keeps Sentinel independent of the
    Investigator so it can be merged and demoed on its own — the WO
    simply stays in ``status='detected'`` with no RCA attached.
    """
    try:
        from agents.investigator import \
            run_investigator  # type: ignore[import-not-found]
    except ImportError:
        log.info(
            "Sentinel: Investigator not yet implemented (#25) — WO %d left in status=detected",
            work_order_id,
        )
        return

    asyncio.create_task(
        run_investigator(work_order_id),
        name=f"investigator-wo-{work_order_id}",
    )
    )
