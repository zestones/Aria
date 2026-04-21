"""Hierarchy router — full CRUD + /tree."""

from __future__ import annotations

import asyncpg
from core.api_response import created, deleted, ok
from core.database import get_db
from core.exceptions import NotFoundError
from core.security import Role, require_role
from core.serialization import serialize as _serialize
from fastapi import APIRouter, Depends
from modules.hierarchy.repository import HierarchyRepository
from modules.hierarchy.schemas import (
    AreaCreate,
    AreaOut,
    AreaUpdate,
    CellCreate,
    CellOut,
    CellUpdate,
    EnterpriseCreate,
    EnterpriseOut,
    EnterpriseUpdate,
    LineCreate,
    LineOut,
    LineUpdate,
    SiteCreate,
    SiteOut,
    SiteUpdate,
)

router = APIRouter(prefix="/api/v1/hierarchy", tags=["hierarchy"])


# ── tree ─────────────────────────────────────────────
@router.get("/tree")
async def tree(conn: asyncpg.Connection = Depends(get_db)):
    rows = await HierarchyRepository(conn).equipment_hierarchy()

    enterprises: dict[int, dict] = {}
    sites: dict[int, dict] = {}
    areas: dict[int, dict] = {}
    lines: dict[int, dict] = {}

    for r in rows:
        e_id = r["enterprise_id"]
        s_id = r["site_id"]
        a_id = r["area_id"]
        l_id = r["line_id"]

        if e_id not in enterprises:
            enterprises[e_id] = {
                "id": e_id,
                "name": r["enterprise_name"],
                "disabled": r["enterprise_disabled"],
                "sites": [],
            }
        if s_id not in sites:
            sites[s_id] = {
                "id": s_id,
                "name": r["site_name"],
                "disabled": r["site_disabled"],
                "parent_id": e_id,
                "areas": [],
            }
            enterprises[e_id]["sites"].append(sites[s_id])
        if a_id not in areas:
            areas[a_id] = {
                "id": a_id,
                "name": r["area_name"],
                "disabled": r["area_disabled"],
                "parent_id": s_id,
                "lines": [],
            }
            sites[s_id]["areas"].append(areas[a_id])
        if l_id not in lines:
            lines[l_id] = {
                "id": l_id,
                "name": r["line_name"],
                "disabled": r["line_disabled"],
                "parent_id": a_id,
                "cells": [],
            }
            areas[a_id]["lines"].append(lines[l_id])
        lines[l_id]["cells"].append(
            {
                "id": r["cell_id"],
                "name": r["cell_name"],
                "disabled": r["cell_disabled"],
                "parent_id": l_id,
            }
        )

    return ok(list(enterprises.values()))


# ── enterprise ──────────────────────────────────────
@router.get("/enterprises")
async def list_enterprises(conn: asyncpg.Connection = Depends(get_db)):
    rows = await HierarchyRepository(conn).list_enterprises()
    return ok([_serialize(EnterpriseOut, r) for r in rows])


@router.get("/enterprises/{item_id}")
async def get_enterprise(item_id: int, conn: asyncpg.Connection = Depends(get_db)):
    rec = await HierarchyRepository(conn).get_enterprise(item_id)
    if not rec:
        raise NotFoundError(f"Enterprise {item_id} not found")
    return ok(_serialize(EnterpriseOut, rec))


@router.post("/enterprises")
async def create_enterprise(
    body: EnterpriseCreate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await HierarchyRepository(conn).create_enterprise(body.name)
    return created(_serialize(EnterpriseOut, rec))


@router.put("/enterprises/{item_id}")
async def update_enterprise(
    item_id: int,
    body: EnterpriseUpdate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await HierarchyRepository(conn).update_enterprise(
        item_id, body.model_dump(exclude_unset=True)
    )
    if not rec:
        raise NotFoundError(f"Enterprise {item_id} not found")
    return ok(_serialize(EnterpriseOut, rec))


@router.delete("/enterprises/{item_id}")
async def delete_enterprise(
    item_id: int,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    if not await HierarchyRepository(conn).delete_enterprise(item_id):
        raise NotFoundError(f"Enterprise {item_id} not found")
    return deleted()


# ── sites ───────────────────────────────────────────
@router.get("/sites")
async def list_sites(conn: asyncpg.Connection = Depends(get_db)):
    rows = await HierarchyRepository(conn).list_sites()
    return ok([_serialize(SiteOut, r) for r in rows])


@router.get("/sites/{item_id}")
async def get_site(item_id: int, conn: asyncpg.Connection = Depends(get_db)):
    rec = await HierarchyRepository(conn).get_site(item_id)
    if not rec:
        raise NotFoundError(f"Site {item_id} not found")
    return ok(_serialize(SiteOut, rec))


@router.post("/sites")
async def create_site(
    body: SiteCreate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await HierarchyRepository(conn).create_site(body.name, body.parentid)
    return created(_serialize(SiteOut, rec))


@router.put("/sites/{item_id}")
async def update_site(
    item_id: int,
    body: SiteUpdate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await HierarchyRepository(conn).update_site(item_id, body.model_dump(exclude_unset=True))
    if not rec:
        raise NotFoundError(f"Site {item_id} not found")
    return ok(_serialize(SiteOut, rec))


@router.delete("/sites/{item_id}")
async def delete_site(
    item_id: int,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    if not await HierarchyRepository(conn).delete_site(item_id):
        raise NotFoundError(f"Site {item_id} not found")
    return deleted()


# ── areas ───────────────────────────────────────────
@router.get("/areas")
async def list_areas(conn: asyncpg.Connection = Depends(get_db)):
    rows = await HierarchyRepository(conn).list_areas()
    return ok([_serialize(AreaOut, r) for r in rows])


@router.get("/areas/{item_id}")
async def get_area(item_id: int, conn: asyncpg.Connection = Depends(get_db)):
    rec = await HierarchyRepository(conn).get_area(item_id)
    if not rec:
        raise NotFoundError(f"Area {item_id} not found")
    return ok(_serialize(AreaOut, rec))


@router.post("/areas")
async def create_area(
    body: AreaCreate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await HierarchyRepository(conn).create_area(body.name, body.parentid)
    return created(_serialize(AreaOut, rec))


@router.put("/areas/{item_id}")
async def update_area(
    item_id: int,
    body: AreaUpdate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await HierarchyRepository(conn).update_area(item_id, body.model_dump(exclude_unset=True))
    if not rec:
        raise NotFoundError(f"Area {item_id} not found")
    return ok(_serialize(AreaOut, rec))


@router.delete("/areas/{item_id}")
async def delete_area(
    item_id: int,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    if not await HierarchyRepository(conn).delete_area(item_id):
        raise NotFoundError(f"Area {item_id} not found")
    return deleted()


# ── lines ───────────────────────────────────────────
@router.get("/lines")
async def list_lines(conn: asyncpg.Connection = Depends(get_db)):
    rows = await HierarchyRepository(conn).list_lines()
    return ok([_serialize(LineOut, r) for r in rows])


@router.get("/lines/{item_id}")
async def get_line(item_id: int, conn: asyncpg.Connection = Depends(get_db)):
    rec = await HierarchyRepository(conn).get_line(item_id)
    if not rec:
        raise NotFoundError(f"Line {item_id} not found")
    return ok(_serialize(LineOut, rec))


@router.post("/lines")
async def create_line(
    body: LineCreate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await HierarchyRepository(conn).create_line(body.name, body.parentid)
    return created(_serialize(LineOut, rec))


@router.put("/lines/{item_id}")
async def update_line(
    item_id: int,
    body: LineUpdate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await HierarchyRepository(conn).update_line(item_id, body.model_dump(exclude_unset=True))
    if not rec:
        raise NotFoundError(f"Line {item_id} not found")
    return ok(_serialize(LineOut, rec))


@router.delete("/lines/{item_id}")
async def delete_line(
    item_id: int,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    if not await HierarchyRepository(conn).delete_line(item_id):
        raise NotFoundError(f"Line {item_id} not found")
    return deleted()


# ── cells ───────────────────────────────────────────
@router.get("/cells")
async def list_cells(conn: asyncpg.Connection = Depends(get_db)):
    rows = await HierarchyRepository(conn).list_cells()
    return ok([_serialize(CellOut, r) for r in rows])


@router.get("/cells/{item_id}")
async def get_cell(item_id: int, conn: asyncpg.Connection = Depends(get_db)):
    rec = await HierarchyRepository(conn).get_cell(item_id)
    if not rec:
        raise NotFoundError(f"Cell {item_id} not found")
    return ok(_serialize(CellOut, rec))


@router.post("/cells")
async def create_cell(
    body: CellCreate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await HierarchyRepository(conn).create_cell(
        body.name, body.parentid, body.ideal_cycle_time_seconds
    )
    return created(_serialize(CellOut, rec))


@router.put("/cells/{item_id}")
async def update_cell(
    item_id: int,
    body: CellUpdate,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rec = await HierarchyRepository(conn).update_cell(item_id, body.model_dump(exclude_unset=True))
    if not rec:
        raise NotFoundError(f"Cell {item_id} not found")
    return ok(_serialize(CellOut, rec))


@router.delete("/cells/{item_id}")
async def delete_cell(
    item_id: int,
    _admin=Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    if not await HierarchyRepository(conn).delete_cell(item_id):
        raise NotFoundError(f"Cell {item_id} not found")
    return deleted()
