"""KPI router."""

from __future__ import annotations

from datetime import datetime, timedelta

import asyncpg
from fastapi import APIRouter, Depends, Query

from core.api_response import ok
from core.database import get_db
from core.security import get_current_user
from modules.kpi.repository import KpiRepository
from modules.kpi.schemas import (
    MaintenanceKpiDTO,
    OeeBucketDTO,
    OeeDTO,
    ProductionStatsDTO,
    QualityByCellDTO,
)

router = APIRouter(
    prefix="/api/v1/kpi",
    tags=["kpi"],
    dependencies=[Depends(get_current_user)],
)


def _parse_bucket(s: str) -> timedelta:
    """Accept '1 hour', '15 minutes', '1 day', '5min', '30s' style strings."""
    s = s.strip().lower()
    units = {
        "s": "seconds",
        "sec": "seconds",
        "secs": "seconds",
        "second": "seconds",
        "seconds": "seconds",
        "m": "minutes",
        "min": "minutes",
        "mins": "minutes",
        "minute": "minutes",
        "minutes": "minutes",
        "h": "hours",
        "hr": "hours",
        "hrs": "hours",
        "hour": "hours",
        "hours": "hours",
        "d": "days",
        "day": "days",
        "days": "days",
    }
    parts = s.split()
    if len(parts) == 1:
        # fused like '15min'
        i = 0
        while i < len(parts[0]) and (parts[0][i].isdigit() or parts[0][i] == "."):
            i += 1
        n_str, unit_str = parts[0][:i], parts[0][i:]
    else:
        n_str, unit_str = parts[0], parts[1]
    try:
        n = float(n_str)
    except ValueError:
        raise ValueError(f"Invalid bucket spec: {s}")
    canonical = units.get(unit_str)
    if not canonical:
        raise ValueError(f"Unknown bucket unit: {unit_str}")
    return timedelta(**{canonical: n})


@router.get("/oee")
async def oee(
    cell_ids: list[int] = Query(..., min_length=1),
    window_start: datetime = Query(...),
    window_end: datetime = Query(...),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await KpiRepository(conn).oee(cell_ids, window_start, window_end)
    dto = OeeDTO(**(dict(rec) if rec else {}))
    return ok(dto.model_dump())


@router.get("/oee/trend")
async def oee_trend(
    cell_ids: list[int] = Query(..., min_length=1),
    window_start: datetime = Query(...),
    window_end: datetime = Query(...),
    bucket: str = Query("1 hour"),
    conn: asyncpg.Connection = Depends(get_db),
):
    bucket_td = _parse_bucket(bucket)
    rows = await KpiRepository(conn).oee_bucketed(cell_ids, window_start, window_end, bucket_td)
    return ok([OeeBucketDTO(**dict(r)).model_dump(mode="json") for r in rows])


@router.get("/maintenance")
async def maintenance(
    cell_ids: list[int] = Query(..., min_length=1),
    window_start: datetime = Query(...),
    window_end: datetime = Query(...),
    conn: asyncpg.Connection = Depends(get_db),
):
    repo = KpiRepository(conn)
    mttr = await repo.mttr(cell_ids, window_start, window_end)
    mtbf = await repo.mtbf(cell_ids, window_start, window_end)
    return ok(MaintenanceKpiDTO(mttr_seconds=mttr, mtbf_seconds=mtbf).model_dump())


@router.get("/production-stats")
async def production_stats(
    cell_ids: list[int] = Query(..., min_length=1),
    window_start: datetime = Query(...),
    window_end: datetime = Query(...),
    conn: asyncpg.Connection = Depends(get_db),
):
    stats = await KpiRepository(conn).production_stats(cell_ids, window_start, window_end)
    return ok(ProductionStatsDTO(**stats).model_dump())


@router.get("/quality/by-cell")
async def quality_by_cell(
    cell_ids: list[int] = Query(..., min_length=1),
    window_start: datetime = Query(...),
    window_end: datetime = Query(...),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await KpiRepository(conn).quality_by_cell(cell_ids, window_start, window_end)
    out = []
    for r in rows:
        total = int(r["total_pieces"] or 0)
        good = int(r["good_pieces"] or 0)
        bad = int(r["bad_pieces"] or 0)
        rate = (good / total) if total > 0 else None
        out.append(
            QualityByCellDTO(
                cell_id=r["cell_id"],
                cell_name=r["cell_name"],
                line_name=r["line_name"],
                total_pieces=total,
                good_pieces=good,
                bad_pieces=bad,
                quality_rate=rate,
            ).model_dump()
        )
    return ok(out)
