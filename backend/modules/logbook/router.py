"""Logbook router."""

from __future__ import annotations

from datetime import datetime

import asyncpg
from fastapi import APIRouter, Depends, Query

from core.api_response import created, ok
from core.database import get_db
from core.exceptions import NotFoundError
from core.security import CurrentUser, Role, get_current_user, require_role
from core.serialization import serialize, serialize_list
from modules.logbook.repository import LogbookRepository
from modules.logbook.schemas import LogbookEntryCreate, LogbookEntryOut

router = APIRouter(
    prefix="/api/v1/logbook",
    tags=["logbook"],
    dependencies=[Depends(get_current_user)],
)


@router.get("")
async def list_entries(
    cell_id: int | None = Query(None),
    category: str | None = Query(None),
    severity: str | None = Query(None),
    window_start: datetime | None = Query(None),
    window_end: datetime | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await LogbookRepository(conn).list(
        cell_id, category, severity, window_start, window_end, limit
    )
    return ok(serialize_list(LogbookEntryOut, rows))


@router.get("/{entry_id}")
async def get_entry(entry_id: int, conn: asyncpg.Connection = Depends(get_db)):
    rec = await LogbookRepository(conn).get(entry_id)
    if not rec:
        raise NotFoundError(f"Logbook entry {entry_id} not found")
    return ok(serialize(LogbookEntryOut, rec))


@router.post("")
async def create_entry(
    body: LogbookEntryCreate,
    user: CurrentUser = Depends(require_role(Role.ADMIN, Role.OPERATOR)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await LogbookRepository(conn).create(
        cell_id=body.cell_id,
        author_id=user.user_id,
        category=body.category,
        severity=body.severity,
        content=body.content,
        related_signal_def_id=body.related_signal_def_id,
        entry_time=body.entry_time,
    )
    return created(serialize(LogbookEntryOut, rec))
