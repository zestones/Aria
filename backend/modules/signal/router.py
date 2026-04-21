"""Signal router — signal_tag CRUD, signal_definition CRUD, history, current."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import asyncpg
from core.api_response import created, deleted, ok
from core.database import get_db
from core.db_helpers import must
from core.exceptions import NotFoundError
from core.security import Role, get_current_user, require_role
from core.serialization import serialize, serialize_list
from fastapi import APIRouter, Depends, Query
from modules.signal.repository import SignalRepository
from modules.signal.schemas import (
    CurrentSignalValueDTO,
    SignalDataPointDTO,
    SignalDefinitionCreate,
    SignalDefinitionOut,
    SignalDefinitionUpdate,
    SignalTagCreate,
    SignalTagOut,
    SignalTagUpdate,
    SignalTypeOut,
    UnitOut,
)

router = APIRouter(
    prefix="/api/v1/signals",
    tags=["signals"],
    dependencies=[Depends(get_current_user)],
)


# ── tags ─────────────────────────────────────────────
@router.get("/tags")
async def list_tags(
    cell_id: int | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await SignalRepository(conn).list_tags(cell_id)
    return ok(serialize_list(SignalTagOut, rows))


@router.get("/tags/{tag_id}")
async def get_tag(tag_id: int, conn: asyncpg.Connection = Depends(get_db)):
    rec = await SignalRepository(conn).get_tag(tag_id)
    if not rec:
        raise NotFoundError(f"Signal tag {tag_id} not found")
    return ok(serialize(SignalTagOut, rec))


@router.post("/tags")
async def create_tag(
    body: SignalTagCreate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await SignalRepository(conn).create_tag(**body.model_dump())
    return created(serialize(SignalTagOut, rec))


@router.put("/tags/{tag_id}")
async def update_tag(
    tag_id: int,
    body: SignalTagUpdate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await SignalRepository(conn).update_tag(tag_id, body.model_dump(exclude_unset=True))
    if not rec:
        raise NotFoundError(f"Signal tag {tag_id} not found")
    return ok(serialize(SignalTagOut, rec))


@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: int,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    if not await SignalRepository(conn).delete_tag(tag_id):
        raise NotFoundError(f"Signal tag {tag_id} not found")
    return deleted()


# ── definitions ─────────────────────────────────────
@router.get("/definitions")
async def list_definitions(
    cell_id: int | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await SignalRepository(conn).list_definitions(cell_id)
    return ok(serialize_list(SignalDefinitionOut, rows))


@router.get("/definitions/{def_id}")
async def get_definition(def_id: int, conn: asyncpg.Connection = Depends(get_db)):
    rec = await SignalRepository(conn).get_definition(def_id)
    if not rec:
        raise NotFoundError(f"Signal definition {def_id} not found")
    return ok(serialize(SignalDefinitionOut, rec))


@router.post("/definitions")
async def create_definition(
    body: SignalDefinitionCreate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    inserted = await SignalRepository(conn).create_definition(**body.model_dump())
    rec = await SignalRepository(conn).get_definition(must(inserted)["id"])
    return created(serialize(SignalDefinitionOut, rec))


@router.put("/definitions/{def_id}")
async def update_definition(
    def_id: int,
    body: SignalDefinitionUpdate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await SignalRepository(conn).update_definition(
        def_id, body.model_dump(exclude_unset=True)
    )
    if not rec:
        raise NotFoundError(f"Signal definition {def_id} not found")
    return ok(serialize(SignalDefinitionOut, rec))


@router.delete("/definitions/{def_id}")
async def delete_definition(
    def_id: int,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    if not await SignalRepository(conn).delete_definition(def_id):
        raise NotFoundError(f"Signal definition {def_id} not found")
    return deleted()


# ── data history ────────────────────────────────────
@router.get("/data/{signal_def_id}")
async def signal_data(
    signal_def_id: int,
    window_start: datetime | None = Query(None),
    window_end: datetime | None = Query(None),
    limit: int = Query(1000, ge=1, le=20000),
    conn: asyncpg.Connection = Depends(get_db),
):
    if window_end is None:
        window_end = datetime.now(timezone.utc)
    if window_start is None:
        window_start = window_end - timedelta(hours=1)
    rows = await SignalRepository(conn).signal_data(signal_def_id, window_start, window_end, limit)
    return ok(serialize_list(SignalDataPointDTO, rows))


@router.get("/current")
async def current_signals(
    cell_ids: list[int] | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await SignalRepository(conn).current_values(cell_ids)
    return ok(serialize_list(CurrentSignalValueDTO, rows))


# ── reference ───────────────────────────────────────
@router.get("/types")
async def signal_types(conn: asyncpg.Connection = Depends(get_db)):
    rows = await SignalRepository(conn).list_signal_types()
    return ok(serialize_list(SignalTypeOut, rows))


@router.get("/units")
async def units(conn: asyncpg.Connection = Depends(get_db)):
    rows = await SignalRepository(conn).list_units()
    return ok(serialize_list(UnitOut, rows))
