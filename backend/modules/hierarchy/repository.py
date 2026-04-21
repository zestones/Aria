"""Hierarchy repository — generic CRUD per ISA-95 level."""

from __future__ import annotations

from typing import Any

import asyncpg


class HierarchyRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    # ── generic helpers ──────────────────────────────
    async def _list(self, table: str) -> list[asyncpg.Record]:
        return await self.conn.fetch(f"SELECT * FROM {table} ORDER BY id")

    async def _get(self, table: str, item_id: int) -> asyncpg.Record | None:
        return await self.conn.fetchrow(f"SELECT * FROM {table} WHERE id = $1", item_id)

    async def _delete(self, table: str, item_id: int) -> bool:
        r = await self.conn.execute(f"DELETE FROM {table} WHERE id = $1", item_id)
        return r.endswith(" 1")

    async def _update(
        self, table: str, item_id: int, fields: dict[str, Any]
    ) -> asyncpg.Record | None:
        if not fields:
            return await self._get(table, item_id)
        sets, vals = [], []
        for i, (col, val) in enumerate(fields.items(), 1):
            sets.append(f"{col} = ${i}")
            vals.append(val)
        sets.append("updated_at = NOW()")
        vals.append(item_id)
        sql = f"UPDATE {table} SET {', '.join(sets)} WHERE id = ${len(vals)} RETURNING *"
        return await self.conn.fetchrow(sql, *vals)

    # ── enterprise ───────────────────────────────────
    async def list_enterprises(self):
        return await self._list("enterprise")

    async def get_enterprise(self, item_id: int):
        return await self._get("enterprise", item_id)

    async def create_enterprise(self, name: str):
        return await self.conn.fetchrow(
            "INSERT INTO enterprise (name) VALUES ($1) RETURNING *", name
        )

    async def update_enterprise(self, item_id: int, fields: dict):
        return await self._update("enterprise", item_id, fields)

    async def delete_enterprise(self, item_id: int):
        return await self._delete("enterprise", item_id)

    # ── site ─────────────────────────────────────────
    async def list_sites(self):
        return await self._list("site")

    async def get_site(self, item_id: int):
        return await self._get("site", item_id)

    async def create_site(self, name: str, parentid: int):
        return await self.conn.fetchrow(
            "INSERT INTO site (name, parentid) VALUES ($1, $2) RETURNING *",
            name,
            parentid,
        )

    async def update_site(self, item_id: int, fields: dict):
        return await self._update("site", item_id, fields)

    async def delete_site(self, item_id: int):
        return await self._delete("site", item_id)

    # ── area ─────────────────────────────────────────
    async def list_areas(self):
        return await self._list("area")

    async def get_area(self, item_id: int):
        return await self._get("area", item_id)

    async def create_area(self, name: str, parentid: int):
        return await self.conn.fetchrow(
            "INSERT INTO area (name, parentid) VALUES ($1, $2) RETURNING *",
            name,
            parentid,
        )

    async def update_area(self, item_id: int, fields: dict):
        return await self._update("area", item_id, fields)

    async def delete_area(self, item_id: int):
        return await self._delete("area", item_id)

    # ── line ─────────────────────────────────────────
    async def list_lines(self):
        return await self._list("line")

    async def get_line(self, item_id: int):
        return await self._get("line", item_id)

    async def create_line(self, name: str, parentid: int):
        return await self.conn.fetchrow(
            "INSERT INTO line (name, parentid) VALUES ($1, $2) RETURNING *",
            name,
            parentid,
        )

    async def update_line(self, item_id: int, fields: dict):
        return await self._update("line", item_id, fields)

    async def delete_line(self, item_id: int):
        return await self._delete("line", item_id)

    # ── cell ─────────────────────────────────────────
    async def list_cells(self):
        return await self._list("cell")

    async def get_cell(self, item_id: int):
        return await self._get("cell", item_id)

    async def create_cell(self, name: str, parentid: int, ideal_cycle_time_seconds: float | None):
        return await self.conn.fetchrow(
            "INSERT INTO cell (name, parentid, ideal_cycle_time_seconds) "
            "VALUES ($1, $2, $3) RETURNING *",
            name,
            parentid,
            ideal_cycle_time_seconds,
        )

    async def update_cell(self, item_id: int, fields: dict):
        return await self._update("cell", item_id, fields)

    async def delete_cell(self, item_id: int):
        return await self._delete("cell", item_id)

    # ── tree (single query) ──────────────────────────
    async def equipment_hierarchy(self):
        return await self.conn.fetch("SELECT * FROM equipment_hierarchy")
