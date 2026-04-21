"""KB + failure history router."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, Query

from core.api_response import created, ok
from core.database import get_db
from core.exceptions import NotFoundError
from core.json_fields import decode_record
from core.security import Role, get_current_user, require_role
from modules.kb.repository import JSON_FIELDS, KbRepository
from modules.kb.schemas import EquipmentKbOut, EquipmentKbUpsert, FailureHistoryOut

router = APIRouter(
    prefix="/api/v1/kb",
    tags=["kb"],
    dependencies=[Depends(get_current_user)],
)


def _ser_kb(r):
    return EquipmentKbOut.model_validate(decode_record(r, JSON_FIELDS)).model_dump(mode="json")


def _ser_failure(r):
    return FailureHistoryOut.model_validate(decode_record(r, JSON_FIELDS)).model_dump(mode="json")


@router.get("/equipment")
async def list_kb(conn: asyncpg.Connection = Depends(get_db)):
    rows = await KbRepository(conn).list()
    return ok([_ser_kb(r) for r in rows])


@router.get("/equipment/{cell_id}")
async def get_kb(cell_id: int, conn: asyncpg.Connection = Depends(get_db)):
    rec = await KbRepository(conn).get_by_cell(cell_id)
    if not rec:
        raise NotFoundError(f"No equipment KB entry for cell {cell_id}")
    return ok(_ser_kb(rec))


@router.put("/equipment")
async def upsert_kb(
    body: EquipmentKbUpsert,
    _user=Depends(require_role(Role.ADMIN, Role.OPERATOR)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await KbRepository(conn).upsert(body.model_dump(exclude_unset=True))
    return created(_ser_kb(rec))


@router.get("/failures")
async def list_failures(
    cell_id: int | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await KbRepository(conn).list_failures(cell_id, limit)
    return ok([_ser_failure(r) for r in rows])
