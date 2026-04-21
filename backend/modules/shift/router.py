"""Shift router."""

from __future__ import annotations

from datetime import date, datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, Query

from core.api_response import created, ok
from core.database import get_db
from core.security import Role, get_current_user, require_role
from core.serialization import serialize, serialize_list
from modules.shift.repository import ShiftRepository
from modules.shift.schemas import ShiftAssignmentCreate, ShiftAssignmentOut, ShiftOut

router = APIRouter(
    prefix="/api/v1/shifts",
    tags=["shifts"],
    dependencies=[Depends(get_current_user)],
)


@router.get("")
async def list_shifts(conn: asyncpg.Connection = Depends(get_db)):
    rows = await ShiftRepository(conn).list_shifts()
    return ok(serialize_list(ShiftOut, rows))


@router.get("/current")
async def current_shift(conn: asyncpg.Connection = Depends(get_db)):
    now = datetime.now(timezone.utc)
    repo = ShiftRepository(conn)
    shift = await repo.get_shift_at(now.time())
    assignments = []
    if shift:
        assignments = await repo.list_assignments_for_shift_date(shift["id"], now.date())
    return ok(
        {
            "shift": serialize(ShiftOut, shift) if shift else None,
            "assignments": [serialize(ShiftAssignmentOut, r) for r in assignments],
            "server_time": now.isoformat(),
        }
    )


@router.get("/assignments")
async def list_assignments(
    assigned_date: date | None = Query(None),
    cell_id: int | None = Query(None),
    user_id: int | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await ShiftRepository(conn).list_assignments(assigned_date, cell_id, user_id)
    return ok(serialize_list(ShiftAssignmentOut, rows))


@router.post("/assignments")
async def create_assignment(
    body: ShiftAssignmentCreate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await ShiftRepository(conn).create_assignment(
        body.shift_id, body.user_id, body.cell_id, body.assigned_date
    )
    return created(serialize(ShiftAssignmentOut, rec))
