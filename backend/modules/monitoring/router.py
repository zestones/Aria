"""Monitoring router — current cell state + event history."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import asyncpg
from fastapi import APIRouter, Depends, Query

from core.api_response import ok
from core.database import get_db
from core.security import get_current_user
from core.serialization import serialize_list
from modules.monitoring.repository import MonitoringRepository
from modules.monitoring.schemas import (
    CurrentCellStatusDTO,
    MachineStatusEventDTO,
    ProductionEventDTO,
)

router = APIRouter(
    prefix="/api/v1/monitoring",
    tags=["monitoring"],
    dependencies=[Depends(get_current_user)],
)


def _default_window() -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    return now - timedelta(hours=1), now


@router.get("/status/current")
async def status_current(
    cell_ids: list[int] | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await MonitoringRepository(conn).current_status(cell_ids)
    return ok(serialize_list(CurrentCellStatusDTO, rows))


@router.get("/events/machine-status")
async def machine_status_events(
    cell_ids: list[int] = Query(..., min_length=1),
    window_start: datetime | None = Query(None),
    window_end: datetime | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    conn: asyncpg.Connection = Depends(get_db),
):
    if window_start is None or window_end is None:
        ws, we = _default_window()
        window_start = window_start or ws
        window_end = window_end or we
    rows = await MonitoringRepository(conn).machine_status_events(
        cell_ids, window_start, window_end, limit
    )
    return ok(serialize_list(MachineStatusEventDTO, rows))


@router.get("/events/production")
async def production_events(
    cell_ids: list[int] = Query(..., min_length=1),
    window_start: datetime | None = Query(None),
    window_end: datetime | None = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    quality_codes: list[int] | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    if window_start is None or window_end is None:
        ws, we = _default_window()
        window_start = window_start or ws
        window_end = window_end or we
    rows = await MonitoringRepository(conn).production_events(
        cell_ids, window_start, window_end, limit, quality_codes
    )
    return ok(serialize_list(ProductionEventDTO, rows))
