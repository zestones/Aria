"""Work order router."""

from __future__ import annotations

import asyncpg
from core.api_response import created, deleted, ok
from core.database import get_db
from core.db_helpers import must
from core.exceptions import NotFoundError
from core.json_fields import decode_record
from core.security import Role, get_current_user, require_role
from fastapi import APIRouter, Depends, Query
from modules.work_order.repository import JSON_FIELDS, WorkOrderRepository
from modules.work_order.schemas import WorkOrderCreate, WorkOrderOut, WorkOrderUpdate

router = APIRouter(
    prefix="/api/v1/work-orders",
    tags=["work-orders"],
    dependencies=[Depends(get_current_user)],
)


def _ser(r: asyncpg.Record) -> dict:
    return WorkOrderOut.model_validate(decode_record(r, JSON_FIELDS)).model_dump(mode="json")


@router.get("")
async def list_orders(
    cell_id: int | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await WorkOrderRepository(conn).list(cell_id, status, limit)
    return ok([_ser(r) for r in rows])


@router.get("/{item_id}")
async def get_order(item_id: int, conn: asyncpg.Connection = Depends(get_db)):
    rec = await WorkOrderRepository(conn).get(item_id)
    if not rec:
        raise NotFoundError(f"Work order {item_id} not found")
    return ok(_ser(rec))


@router.post("")
async def create_order(
    body: WorkOrderCreate,
    _user=Depends(require_role(Role.ADMIN, Role.OPERATOR)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await WorkOrderRepository(conn).create(body.model_dump(exclude_unset=True))
    return created(_ser(must(rec)))


@router.put("/{item_id}")
async def update_order(
    item_id: int,
    body: WorkOrderUpdate,
    _user=Depends(require_role(Role.ADMIN, Role.OPERATOR)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await WorkOrderRepository(conn).update(item_id, body.model_dump(exclude_unset=True))
    if not rec:
        raise NotFoundError(f"Work order {item_id} not found")
    return ok(_ser(rec))


@router.delete("/{item_id}")
async def delete_order(
    item_id: int,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    if not await WorkOrderRepository(conn).delete(item_id):
        raise NotFoundError(f"Work order {item_id} not found")
    return deleted()
