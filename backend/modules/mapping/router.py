"""Mapping router — reference codes + PLC labels + cell mappings CRUD."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, Query

from core.api_response import created, deleted, ok
from core.database import get_db
from core.exceptions import NotFoundError
from core.security import Role, get_current_user, require_role
from core.serialization import serialize as _ser
from modules.mapping.repository import MappingRepository
from modules.mapping.schemas import (
    CellQualityMappingCreate,
    CellQualityMappingOut,
    CellQualityMappingUpdate,
    CellStatusMappingCreate,
    CellStatusMappingOut,
    CellStatusMappingUpdate,
    MachineStatusCodeOut,
    PlcLabelCreate,
    PlcLabelOut,
    QualityCodeOut,
)

router = APIRouter(
    prefix="/api/v1/mapping",
    tags=["mapping"],
    dependencies=[Depends(get_current_user)],
)


# ── reference ───────────────────────────────────────
@router.get("/status-codes")
async def status_codes(conn: asyncpg.Connection = Depends(get_db)):
    rows = await MappingRepository(conn).list_status_codes()
    return ok([_ser(MachineStatusCodeOut, r) for r in rows])


@router.get("/quality-codes")
async def quality_codes(conn: asyncpg.Connection = Depends(get_db)):
    rows = await MappingRepository(conn).list_quality_codes()
    return ok([_ser(QualityCodeOut, r) for r in rows])


# ── PLC labels ──────────────────────────────────────
@router.get("/status-labels")
async def status_labels(conn: asyncpg.Connection = Depends(get_db)):
    rows = await MappingRepository(conn).list_status_labels()
    return ok([_ser(PlcLabelOut, r) for r in rows])


@router.post("/status-labels")
async def create_status_label(
    body: PlcLabelCreate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await MappingRepository(conn).create_status_label(body.label_name, body.description)
    return created(_ser(PlcLabelOut, rec))


@router.get("/quality-labels")
async def quality_labels(conn: asyncpg.Connection = Depends(get_db)):
    rows = await MappingRepository(conn).list_quality_labels()
    return ok([_ser(PlcLabelOut, r) for r in rows])


@router.post("/quality-labels")
async def create_quality_label(
    body: PlcLabelCreate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await MappingRepository(conn).create_quality_label(body.label_name, body.description)
    return created(_ser(PlcLabelOut, rec))


# ── cell status mappings ────────────────────────────
@router.get("/status")
async def list_status_mappings(
    cell_id: int | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await MappingRepository(conn).list_status_mappings(cell_id)
    return ok([_ser(CellStatusMappingOut, r) for r in rows])


@router.post("/status")
async def create_status_mapping(
    body: CellStatusMappingCreate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await MappingRepository(conn).create_status_mapping(**body.model_dump())
    return created(_ser(CellStatusMappingOut, rec))


@router.put("/status/{item_id}")
async def update_status_mapping(
    item_id: int,
    body: CellStatusMappingUpdate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await MappingRepository(conn).update_status_mapping(
        item_id, body.model_dump(exclude_unset=True)
    )
    if not rec:
        raise NotFoundError(f"Status mapping {item_id} not found")
    return ok(_ser(CellStatusMappingOut, rec))


@router.delete("/status/{item_id}")
async def delete_status_mapping(
    item_id: int,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    if not await MappingRepository(conn).delete_status_mapping(item_id):
        raise NotFoundError(f"Status mapping {item_id} not found")
    return deleted()


# ── cell quality mappings ───────────────────────────
@router.get("/quality")
async def list_quality_mappings(
    cell_id: int | None = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await MappingRepository(conn).list_quality_mappings(cell_id)
    return ok([_ser(CellQualityMappingOut, r) for r in rows])


@router.post("/quality")
async def create_quality_mapping(
    body: CellQualityMappingCreate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await MappingRepository(conn).create_quality_mapping(**body.model_dump())
    return created(_ser(CellQualityMappingOut, rec))


@router.put("/quality/{item_id}")
async def update_quality_mapping(
    item_id: int,
    body: CellQualityMappingUpdate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await MappingRepository(conn).update_quality_mapping(
        item_id, body.model_dump(exclude_unset=True)
    )
    if not rec:
        raise NotFoundError(f"Quality mapping {item_id} not found")
    return ok(_ser(CellQualityMappingOut, rec))


@router.delete("/quality/{item_id}")
async def delete_quality_mapping(
    item_id: int,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    if not await MappingRepository(conn).delete_quality_mapping(item_id):
        raise NotFoundError(f"Quality mapping {item_id} not found")
    return deleted()
