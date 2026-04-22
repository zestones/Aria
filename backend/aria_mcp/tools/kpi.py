"""KPI tools (M2.2) — OEE, MTBF, MTTR, downtime breakdown.

M2.6 adds get_quality_metrics and get_production_stats — thin wrappers over
the already-implemented KpiRepository.quality_by_cell and
KpiRepository.production_stats methods.
"""

from __future__ import annotations

from datetime import timedelta

from aria_mcp._common import with_conn
from aria_mcp.server import mcp
from core.datetime_helpers import parse_tz_aware
from modules.kpi.repository import KpiRepository
from modules.kpi.schemas import MaintenanceKpiDTO, OeeBucketDTO, OeeDTO, QualityByCellDTO


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
    async with with_conn() as conn:
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
    async with with_conn() as conn:
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
    async with with_conn() as conn:
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
    async with with_conn() as conn:
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


@mcp.tool()
async def get_quality_metrics(
    cell_ids: list[int],
    window_start: str,
    window_end: str,
) -> list[dict]:
    """Per-cell quality breakdown for a time window (M2.6).

    Used by the Q&A agent to answer questions like *"how many off-spec pieces
    today?"* without requiring the Investigator's full RCA flow.

    Args:
        cell_ids: List of cell ids to aggregate over (must be non-empty).
        window_start: ISO-8601 timestamp with TZ offset (inclusive).
        window_end: ISO-8601 timestamp with TZ offset (exclusive).

    Returns:
        List of ``{cell_id, cell_name, line_name, total_pieces, good_pieces,
        bad_pieces, quality_rate}`` — one entry per cell, ordered by
        ``cell_id``. ``quality_rate`` is ``good_pieces / total_pieces`` in
        [0, 1], or ``null`` when no production events exist in the window.
    """
    ws = parse_tz_aware(window_start)
    we = parse_tz_aware(window_end)
    async with with_conn() as conn:
        rows = await KpiRepository(conn).quality_by_cell(cell_ids, ws, we)
    out: list[dict] = []
    for r in rows:
        total = int(r["total_pieces"] or 0)
        good = int(r["good_pieces"] or 0)
        bad = int(r["bad_pieces"] or 0)
        dto = QualityByCellDTO(
            cell_id=r["cell_id"],
            cell_name=r["cell_name"],
            line_name=r["line_name"],
            total_pieces=total,
            good_pieces=good,
            bad_pieces=bad,
            quality_rate=round(good / total, 4) if total > 0 else None,
        )
        out.append(dto.model_dump(mode="json"))
    return out


@mcp.tool()
async def get_production_stats(
    cell_ids: list[int],
    window_start: str,
    window_end: str,
) -> dict:
    """Aggregate production and availability statistics for a time window (M2.6).

    Used by the Q&A agent to answer questions like *"what was our production
    last week?"*. Wraps ``KpiRepository.production_stats`` which already
    aggregates machine-status durations + production event counts.

    Args:
        cell_ids: List of cell ids to aggregate over (must be non-empty).
        window_start: ISO-8601 timestamp with TZ offset (inclusive).
        window_end: ISO-8601 timestamp with TZ offset (exclusive).

    Returns:
        ``{productive_seconds, unplanned_stop_seconds, planned_stop_seconds,
        total_pieces, good_pieces, bad_pieces}`` — aggregated across all
        requested cells.
    """
    ws = parse_tz_aware(window_start)
    we = parse_tz_aware(window_end)
    async with with_conn() as conn:
        stats = await KpiRepository(conn).production_stats(cell_ids, ws, we)
    bad_pieces = stats["total_pieces"] - stats["good_pieces"]
    return {
        "productive_seconds": stats["productive_seconds"],
        "unplanned_stop_seconds": stats["unplanned_stop_seconds"],
        "planned_stop_seconds": stats["planned_stop_seconds"],
        "total_pieces": stats["total_pieces"],
        "good_pieces": stats["good_pieces"],
        "bad_pieces": bad_pieces,
    }
