"""ARIA MCP tools — KPI wrappers (M2.2).

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
from modules.kpi.repository import KpiRepository
from modules.kpi.schemas import MaintenanceKpiDTO, OeeBucketDTO, OeeDTO


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
