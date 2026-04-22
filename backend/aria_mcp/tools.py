"""ARIA MCP tools — KPI wrappers (M2.2) + Signal tools (M2.3).

Each tool acquires its own connection from the shared asyncpg pool via
``_with_conn()``. No FastAPI Depends, no persistent session per agent.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import timedelta
from typing import AsyncIterator

import asyncpg
from aria_mcp.server import mcp
from core.database import db
from core.datetime_helpers import parse_tz_aware
from core.thresholds import evaluate_threshold, match_threshold_key_to_signal
from modules.kb.kb_schema import EquipmentKB
from modules.kpi.repository import KpiRepository
from modules.kpi.schemas import MaintenanceKpiDTO, OeeBucketDTO, OeeDTO
from modules.signal.repository import SignalRepository


@asynccontextmanager
async def _with_conn() -> AsyncIterator[asyncpg.Connection]:
    """Acquire+release a pooled DB connection for one tool call."""
    async with db.pool.acquire() as conn:
        yield conn


@mcp.tool()
async def get_oee(
    cell_ids: list[int],
    window_start: str,
    window_end: str,
    bucket_minutes: int | None = None,
) -> dict:
    """Compute OEE (availability * performance * quality) for the given cells & window.

    Args:
        cell_ids: List of cell ids to aggregate over (must be non-empty).
        window_start: ISO-8601 timestamp with TZ offset, e.g. "2026-04-22T13:00:00Z".
        window_end: ISO-8601 timestamp with TZ offset (exclusive upper bound).
        bucket_minutes: If set, returns a trend bucketed at this resolution
            instead of a single aggregate.

    Returns:
        Aggregate mode (default):
            ``{availability, performance, quality, oee}`` — each in [0, 1] or null.
        Bucketed mode (``bucket_minutes`` set):
            ``{buckets: [{bucket, cell_id, availability, performance, quality, oee}]}``
            where ``bucket`` is an ISO-8601 timestamp.
    """
    ws = parse_tz_aware(window_start)
    we = parse_tz_aware(window_end)
    async with _with_conn() as conn:
        repo = KpiRepository(conn)
        if bucket_minutes is not None:
            rows = await repo.oee_bucketed(cell_ids, ws, we, timedelta(minutes=bucket_minutes))
            return {"buckets": [OeeBucketDTO(**dict(r)).model_dump(mode="json") for r in rows]}
        rec = await repo.oee(cell_ids, ws, we)
        return OeeDTO(**(dict(rec) if rec else {})).model_dump(mode="json")


@mcp.tool()
async def get_mtbf(
    cell_ids: list[int],
    window_start: str,
    window_end: str,
) -> dict:
    """Compute Mean Time Between Failures (seconds) for the given cells & window.

    Returns:
        ``{mtbf_seconds: float | null}`` — null if no failures occurred.
    """
    ws = parse_tz_aware(window_start)
    we = parse_tz_aware(window_end)
    async with _with_conn() as conn:
        mtbf = await KpiRepository(conn).mtbf(cell_ids, ws, we)
    return MaintenanceKpiDTO(mtbf_seconds=mtbf).model_dump(mode="json", include={"mtbf_seconds"})


@mcp.tool()
async def get_mttr(
    cell_ids: list[int],
    window_start: str,
    window_end: str,
) -> dict:
    """Compute Mean Time To Repair (seconds) for the given cells & window.

    Returns:
        ``{mttr_seconds: float | null}`` — null if no repairs occurred.
    """
    ws = parse_tz_aware(window_start)
    we = parse_tz_aware(window_end)
    async with _with_conn() as conn:
        mttr = await KpiRepository(conn).mttr(cell_ids, ws, we)
    return MaintenanceKpiDTO(mttr_seconds=mttr).model_dump(mode="json", include={"mttr_seconds"})


@mcp.tool()
async def get_downtime_events(
    cell_ids: list[int],
    window_start: str,
    window_end: str,
    categories: list[str] | None = None,
) -> list[dict]:
    """Aggregate downtime durations by status (category, name) for the window.

    Aggregated per the audit decision: the Investigator agent (M4.3) needs
    "where did the downtime go?" framing, not raw event rows.

    Args:
        cell_ids: List of cell ids.
        window_start: ISO-8601 with TZ.
        window_end: ISO-8601 with TZ.
        categories: Optional filter (e.g. ``["unplanned_stop", "planned_stop"]``).
            If omitted, returns all non-running categories.

    Returns:
        List of ``{status_category, status_name, total_seconds}`` rows,
        ordered by ``total_seconds`` descending.
    """
    ws = parse_tz_aware(window_start)
    we = parse_tz_aware(window_end)
    async with _with_conn() as conn:
        cats = categories if categories else ["unplanned_stop", "planned_stop", "changeover"]
        rows = await conn.fetch(
            """
            SELECT msc.status_category, msc.status_name,
                   COALESCE(SUM(d.duration_secs), 0)::float AS total_seconds
            FROM fn_status_durations($1::int[], $2, $3) d
            JOIN machine_status_code msc ON d.status_code = msc.status_code
            WHERE msc.status_category = ANY($4::text[])
            GROUP BY msc.status_category, msc.status_name
            ORDER BY total_seconds DESC
            """,
            cell_ids,
            ws,
            we,
            cats,
        )
    return [
        {
            "status_category": r["status_category"],
            "status_name": r["status_name"],
            "total_seconds": float(r["total_seconds"]),
        }
        for r in rows
    ]


# ─────────────────────────────────────────────────────────────────────
# M2.3 — Signal tools
# ─────────────────────────────────────────────────────────────────────

_AGGREGATION_INTERVALS: dict[str, timedelta] = {
    "10s": timedelta(seconds=10),
    "30s": timedelta(seconds=30),
    "1m": timedelta(minutes=1),
    "5m": timedelta(minutes=5),
    "15m": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "1d": timedelta(days=1),
}


def _parse_aggregation(s: str) -> timedelta:
    if s not in _AGGREGATION_INTERVALS:
        valid = ", ".join(_AGGREGATION_INTERVALS.keys())
        raise ValueError(f"aggregation {s!r} not supported; expected one of: {valid}")
    return _AGGREGATION_INTERVALS[s]


@mcp.tool()
async def get_signal_trends(
    signal_def_ids: list[int],
    window_start: str,
    window_end: str,
    aggregation: str = "1m",
) -> list[dict]:
    """Bucketed time-series for one or more process signals.

    Args:
        signal_def_ids: List of ``process_signal_definition.id`` (non-empty).
            Multiple signals are returned interleaved so an Investigator
            agent can overlay correlated signals in one round-trip.
        window_start: ISO-8601 with TZ offset.
        window_end: ISO-8601 with TZ offset (exclusive).
        aggregation: Bucket size — one of ``10s, 30s, 1m, 5m, 15m, 1h, 1d``.

    Returns:
        List of ``{time: iso_str, signal_def_id: int, avg: float,
        min: float, max: float}`` ordered by ``(time, signal_def_id)``.
    """
    ws = parse_tz_aware(window_start)
    we = parse_tz_aware(window_end)
    bucket = _parse_aggregation(aggregation)
    async with _with_conn() as conn:
        rows = await SignalRepository(conn).signal_data_bucketed(signal_def_ids, ws, we, bucket)
    return [
        {
            "time": r["bucket"].isoformat(),
            "signal_def_id": r["signal_def_id"],
            "avg": float(r["avg"]) if r["avg"] is not None else None,
            "min": float(r["min"]) if r["min"] is not None else None,
            "max": float(r["max"]) if r["max"] is not None else None,
        }
        for r in rows
    ]


@mcp.tool()
async def get_signal_anomalies(
    cell_id: int,
    window_start: str,
    window_end: str,
) -> list[dict]:
    """Detect threshold breaches in process_signal_data against ``equipment_kb``.

    For every threshold defined in the cell's KB, fuzzy-matches the threshold
    key (e.g. ``"vibration_mm_s"``) to a signal_def by token overlap on
    ``display_name``/``signal_type``, then scans the window for breaches via
    the unified ``core.thresholds.evaluate_threshold`` helper (handles both
    single-sided ``alert``/``trip`` and double-sided ``low_alert``/``high_alert``
    shapes).

    Args:
        cell_id: Target cell.
        window_start: ISO-8601 with TZ.
        window_end: ISO-8601 with TZ.

    Returns:
        List of ``{signal_def_id, display_name, kb_key, time: iso_str,
        value: float, threshold_field: "alert"|"trip"|"low_alert"|"high_alert",
        threshold_value: float, severity: "alert"|"trip", direction: "high"|"low"}``
        ordered by time ascending. Empty list if KB has no thresholds or no
        breaches occurred.
    """
    ws = parse_tz_aware(window_start)
    we = parse_tz_aware(window_end)
    async with _with_conn() as conn:
        kb_row = await conn.fetchrow(
            "SELECT structured_data FROM equipment_kb WHERE cell_id = $1",
            cell_id,
        )
        if not kb_row or not kb_row["structured_data"]:
            return []
        kb = EquipmentKB.model_validate_json(kb_row["structured_data"])
        if not kb.thresholds:
            return []

        sig_rows = await conn.fetch(
            """
            SELECT psd.id, psd.display_name, st.type_name AS signal_type
            FROM process_signal_definition psd
            LEFT JOIN signal_type st ON psd.signal_type_id = st.id
            WHERE psd.cell_id = $1
            """,
            cell_id,
        )
        # Resolve kb_key → signal_def_id via token overlap (best-effort,
        # documented heuristic — see core.thresholds.match_threshold_key_to_signal)
        key_to_sig: dict[str, tuple[int, str]] = {}
        for kb_key in kb.thresholds:
            best_id: int | None = None
            best_name: str = ""
            best_score = 0
            for sr in sig_rows:
                score = match_threshold_key_to_signal(kb_key, sr["display_name"], sr["signal_type"])
                if score > best_score:
                    best_score = score
                    best_id = sr["id"]
                    best_name = sr["display_name"]
            if best_id is not None:
                key_to_sig[kb_key] = (best_id, best_name)

        if not key_to_sig:
            return []

        sig_ids = [v[0] for v in key_to_sig.values()]
        data_rows = await conn.fetch(
            """
            SELECT time, signal_def_id, raw_value
            FROM process_signal_data
            WHERE signal_def_id = ANY($1::int[])
              AND time >= $2 AND time < $3
            ORDER BY time ASC
            """,
            sig_ids,
            ws,
            we,
        )

    sig_to_kb: dict[int, str] = {v[0]: k for k, v in key_to_sig.items()}
    sig_to_name: dict[int, str] = {v[0]: v[1] for v in key_to_sig.values()}

    out: list[dict] = []
    for row in data_rows:
        sig_id = row["signal_def_id"]
        kb_key = sig_to_kb[sig_id]
        result = evaluate_threshold(kb.thresholds[kb_key], float(row["raw_value"]))
        if not result["breached"]:
            continue
        out.append(
            {
                "signal_def_id": sig_id,
                "display_name": sig_to_name[sig_id],
                "kb_key": kb_key,
                "time": row["time"].isoformat(),
                "value": float(row["raw_value"]),
                "threshold_field": result["threshold_field"],
                "threshold_value": result["threshold_value"],
                "severity": result["severity"],
                "direction": result["direction"],
            }
        )
    return out


@mcp.tool()
async def get_current_signals(cell_id: int) -> list[dict]:
    """Latest value for every active signal on a cell (wraps ``current_process_signals``).

    Used by the Investigator agent to grab "all signals on this cell right now"
    in a single round-trip rather than iterating per-signal.

    Args:
        cell_id: Target cell.

    Returns:
        List of ``{signal_def_id, cell_id, cell_name, line_name, display_name,
        unit, signal_type, last_update: iso_str | null, raw_value: float | null}``.
    """
    async with _with_conn() as conn:
        rows = await SignalRepository(conn).current_values([cell_id])
    return [
        {
            "signal_def_id": r["signal_def_id"],
            "cell_id": r["cell_id"],
            "cell_name": r["cell_name"],
            "line_name": r["line_name"],
            "display_name": r["display_name"],
            "unit": r["unit"],
            "signal_type": r["signal_type"],
            "last_update": r["last_update"].isoformat() if r["last_update"] else None,
            "raw_value": float(r["raw_value"]) if r["raw_value"] is not None else None,
        }
        for r in rows
    ]
