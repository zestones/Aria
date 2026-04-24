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
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from agents.investigator import run_investigator
from aria_mcp.client import mcp_client
from core.database import db
from core.db_helpers import must
from core.ws_manager import ws_manager
from modules.work_order.repository import WorkOrderRepository

log = logging.getLogger("aria.sentinel")
forecast_log = logging.getLogger("aria.forecast")

_TICK_SECONDS = 30
_WINDOW_MINUTES = 5
_DEBOUNCE_MINUTES = 30

# ---- Forecast-watch constants (M9 predictive-alerting loop) --------------
# Cadence is deliberately slower than the 30s breach loop: forecasts are
# trend-based and change on a much longer timescale than single-sample
# threshold crossings. A 60s tick also halves the database pressure.
_FORECAST_TICK_SECONDS = 60
# Regression input window. Short enough that a fresh drift is visible in
# the slope, long enough that periodic noise averages out. The frontend's
# client-side chart forecast uses the same default.
_FORECAST_WINDOW_HOURS = 6
# How far forward to project. Longer horizons amplify regression error
# (a tiny slope error compounds linearly with time); 12h is the sweet
# spot for maintenance-window planning without over-claiming.
_FORECAST_HORIZON_HOURS = 12
# Minimum samples needed to trust a slope. Below this we punt silently.
_FORECAST_MIN_SAMPLES = 20
# R² below this → slope is noise, not drift. Empirically 0.35 keeps out
# random-walk signals while still catching real monotonic drifts.
_FORECAST_MIN_CONFIDENCE = 0.35
# Drift rate must exceed this fraction of the last value per hour to be
# "noteworthy" — keeps the loop from firing on signals hovering near a
# threshold with effectively zero slope.
_FORECAST_MIN_DRIFT_RATE = 0.005  # 0.5% / hour
# Per (cell, signal) re-emit cooldown. Avoids hammering the banner with
# the same forecast every tick for 12 hours straight.
_FORECAST_DEBOUNCE_SECONDS = 30 * 60
# Upper bound on how many data points we fetch per signal — downsampling
# before regression is fine; more rows only cost bandwidth.
_FORECAST_FETCH_LIMIT = 1000

# Module-level flag — emit the "watching / ignored" summary exactly once at
# first tick so the Docker logs carry a stable startup fingerprint without
# being spammed every 30s.
_logged_cells = False

# Forecast-watch in-memory debounce table. Keyed by (cell_id, signal_def_id);
# value is the monotonic ``loop.time()`` of the last emit. Process-local is
# fine for the demo's single-worker deployment — matches the WS manager's
# own scope (``core.ws_manager``).
_forecast_last_emit: dict[tuple[int, int], float] = {}


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
    asyncio.create_task(
        run_investigator(work_order_id),
        name=f"investigator-wo-{work_order_id}",
    )


# ---------------------------------------------------------------------------
# Forecast-watch (M9 predictive-alerting loop)
#
# Sibling to :func:`sentinel_loop`. Runs ordinary least-squares regression on
# the tail of every monitored signal and emits ``forecast_warning`` on the
# events bus when the projected trajectory will cross a threshold within
# :data:`_FORECAST_HORIZON_HOURS`. Unlike Sentinel's breach detection — which
# only fires *after* a real threshold crossing — this loop alerts the
# operator *before* the failure condition occurs. Forecast warnings are
# ephemeral (WS-only), never persist a row, and never open a work order:
# they are advisory. The Investigator is not spawned from here.
# ---------------------------------------------------------------------------


async def forecast_watch_loop() -> None:
    """Run forever. Wraps each tick in try/except so the loop never dies.

    Starts on the same lifespan as :func:`sentinel_loop` (see
    :mod:`main`). Unlike Sentinel it does not need the MCP server to be
    up — it queries the DB directly — but we keep it inside the MCP
    lifespan block for symmetry with Sentinel's startup contract.
    """
    log.info("Forecast-watch started (horizon=%dh, tick=%ds)",
             _FORECAST_HORIZON_HOURS, _FORECAST_TICK_SECONDS)
    while True:
        try:
            await _forecast_watch_tick()
        except Exception:  # noqa: BLE001 — outer loop must survive any tick-level error
            forecast_log.exception("Forecast-watch tick failed — continuing")
        await asyncio.sleep(_FORECAST_TICK_SECONDS)


async def _forecast_watch_tick() -> None:
    """One forecast pass over every onboarded cell.

    Fetches the full set of signals with a configured KB threshold, and
    for each one runs the regression + threshold-ETA check. We do **not**
    call ``get_signal_anomalies`` here — that tool is for real breaches;
    a forecast is a speculative prediction and belongs to a different
    contract.
    """
    async with db.pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT psd.id AS signal_def_id,
                   psd.cell_id,
                   psd.display_name,
                   psd.kb_threshold_key,
                   c.name AS cell_name,
                   k.structured_data -> 'thresholds' -> psd.kb_threshold_key AS thresholds_json
            FROM process_signal_definition psd
            JOIN equipment_kb k ON k.cell_id = psd.cell_id
            JOIN cell c ON c.id = psd.cell_id
            WHERE k.onboarding_complete = TRUE
              AND psd.kb_threshold_key IS NOT NULL
            ORDER BY psd.cell_id, psd.id
            """
        )

    if not rows:
        return

    window_end = datetime.now(timezone.utc)
    window_start = window_end - timedelta(hours=_FORECAST_WINDOW_HOURS)

    for row in rows:
        try:
            await _forecast_one_signal(
                cell_id=row["cell_id"],
                cell_name=row["cell_name"],
                signal_def_id=row["signal_def_id"],
                display_name=row["display_name"],
                thresholds_json=row["thresholds_json"],
                window_start=window_start,
                window_end=window_end,
            )
        except Exception:  # noqa: BLE001 — per-signal failure must not kill the tick
            forecast_log.exception(
                "forecast-watch failed for cell=%s signal_def=%s",
                row["cell_id"],
                row["signal_def_id"],
            )


async def _forecast_one_signal(
    *,
    cell_id: int,
    cell_name: str,
    signal_def_id: int,
    display_name: str,
    thresholds_json: Any,
    window_start: datetime,
    window_end: datetime,
) -> None:
    """Regress one signal's tail, emit ``forecast_warning`` on projected breach."""
    thresholds = _parse_thresholds(thresholds_json)
    if not thresholds:
        return

    async with db.pool.acquire() as conn:
        samples = await conn.fetch(
            """
            SELECT time, raw_value
            FROM process_signal_data
            WHERE signal_def_id = $1 AND time >= $2 AND time < $3
            ORDER BY time ASC
            LIMIT $4
            """,
            signal_def_id,
            window_start,
            window_end,
            _FORECAST_FETCH_LIMIT,
        )

    if len(samples) < _FORECAST_MIN_SAMPLES:
        return

    regression = _ordinary_least_squares(samples)
    if regression is None:
        return
    slope, _intercept, r_squared, _last_x_hours, last_value = regression

    if r_squared < _FORECAST_MIN_CONFIDENCE:
        return

    # Drift-rate floor: skip signals whose slope is numerically present but
    # practically flat (e.g. millionth-of-a-unit-per-hour noise).
    reference = max(1e-6, abs(last_value))
    if abs(slope) / reference < _FORECAST_MIN_DRIFT_RATE:
        return

    trend = "rising" if slope > 0 else "falling"

    pick = _pick_first_breach(
        thresholds=thresholds,
        last_value=last_value,
        slope=slope,
        horizon_hours=_FORECAST_HORIZON_HOURS,
    )
    if pick is None:
        return
    threshold_value, threshold_field, eta_hours = pick

    key = (cell_id, signal_def_id)
    loop = asyncio.get_running_loop()
    now_mono = loop.time()
    last = _forecast_last_emit.get(key)
    if last is not None and (now_mono - last) < _FORECAST_DEBOUNCE_SECONDS:
        return
    _forecast_last_emit[key] = now_mono

    # Severity tone: ETA within 2h is trip-grade; otherwise an alert. The
    # frontend banner already ramps its accent color off this field.
    severity = "trip" if eta_hours <= 2.0 else "alert"
    projected_breach_at = datetime.now(timezone.utc) + timedelta(hours=eta_hours)
    turn_id = uuid.uuid4().hex

    payload: dict[str, Any] = {
        "cell_id": cell_id,
        "cell_name": cell_name,
        "signal_def_id": signal_def_id,
        "signal_name": display_name,
        "current_value": round(last_value, 3),
        "threshold_value": threshold_value,
        "threshold_field": threshold_field,
        "slope_per_hour": round(slope, 4),
        "confidence": round(r_squared, 3),
        "eta_hours": round(eta_hours, 2),
        "trend": trend,
        "severity": severity,
        "projected_breach_at": projected_breach_at.isoformat(),
        "detected_at": datetime.now(timezone.utc).isoformat(),
        "turn_id": turn_id,
    }
    await ws_manager.broadcast("forecast_warning", payload)
    forecast_log.info(
        "forecast_warning cell=%d signal_def=%d eta=%.2fh trend=%s r2=%.2f",
        cell_id,
        signal_def_id,
        eta_hours,
        trend,
        r_squared,
    )


def _parse_thresholds(raw: Any) -> dict[str, float]:
    """Accept the ``equipment_kb.structured_data.thresholds[key]`` jsonb blob.

    Keys like ``alert`` / ``trip`` / ``low_alert`` / ``high_alert`` /
    ``low_trip`` / ``high_trip`` map directly to numeric limits. We drop
    everything non-numeric — the contract mirrors ``evaluate_threshold``
    which only consumes numeric fields.
    """
    if raw is None:
        return {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, float] = {}
    for k, v in raw.items():
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            out[str(k)] = float(v)
    return out


def _pick_first_breach(
    *,
    thresholds: dict[str, float],
    last_value: float,
    slope: float,
    horizon_hours: float,
) -> tuple[float, str, float] | None:
    """Return ``(threshold_value, threshold_field, eta_hours)`` for the
    threshold that the projected trajectory crosses first within
    ``horizon_hours`` — or ``None`` if no threshold is reachable.

    A threshold at ``T`` is reachable when ``sign(T - last_value) == sign(slope)``
    and the ETA ``(T - last_value) / slope`` is strictly positive and
    under the horizon.
    """
    if abs(slope) < 1e-9:
        return None
    best: tuple[float, str, float] | None = None
    for field_name, t_value in thresholds.items():
        delta = t_value - last_value
        if delta == 0:
            # Already at threshold — any drift is "now". We leave these to
            # Sentinel's real-breach loop and don't forecast.
            continue
        if (delta > 0) != (slope > 0):
            # Drifting away from this threshold.
            continue
        eta = delta / slope
        if eta <= 0 or eta > horizon_hours:
            continue
        if best is None or eta < best[2]:
            best = (t_value, field_name, eta)
    return best


def _ordinary_least_squares(
    samples: list[dict[str, Any]],
) -> tuple[float, float, float, float, float] | None:
    """Regress ``raw_value = slope * hours_since_t0 + intercept``.

    Returns ``(slope, intercept, r_squared, last_x_hours, last_value)`` on
    success; ``None`` if the input is degenerate (all-constant or single
    timestamp). ``r_squared`` is the coefficient of determination, which
    we gate on to reject pure-noise series.
    """
    if not samples:
        return None
    t0_ms = samples[0]["time"].timestamp() * 1000.0
    xs: list[float] = []
    ys: list[float] = []
    for s in samples:
        ts = s["time"]
        v = s["raw_value"]
        if v is None:
            continue
        try:
            y = float(v)
        except (TypeError, ValueError):
            continue
        xs.append((ts.timestamp() * 1000.0 - t0_ms) / (1000.0 * 3600.0))  # hours
        ys.append(y)

    n = len(xs)
    if n < 3:
        return None
    sum_x = math.fsum(xs)
    sum_y = math.fsum(ys)
    sum_xy = math.fsum(x * y for x, y in zip(xs, ys, strict=True))
    sum_xx = math.fsum(x * x for x in xs)
    denom = n * sum_xx - sum_x * sum_x
    if abs(denom) < 1e-12:
        return None
    slope = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n

    mean_y = sum_y / n
    ss_tot = math.fsum((y - mean_y) ** 2 for y in ys)
    if ss_tot < 1e-12:
        # Constant series — slope is meaningless, no drift to report.
        return None
    ss_res = math.fsum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys, strict=True))
    r_squared = max(0.0, 1.0 - ss_res / ss_tot)

    last_x = xs[-1]
    last_value = ys[-1]
    return slope, intercept, r_squared, last_x, last_value
