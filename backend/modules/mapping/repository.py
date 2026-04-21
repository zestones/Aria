"""Mapping repository — cell mappings + PLC labels + reference codes."""

from __future__ import annotations

from typing import Any

import asyncpg


class MappingRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    # reference
    async def list_status_codes(self):
        return await self.conn.fetch("SELECT * FROM machine_status_code ORDER BY status_code")

    async def list_quality_codes(self):
        return await self.conn.fetch("SELECT * FROM quality_code ORDER BY quality_code")

    # status PLC labels
    async def list_status_labels(self):
        return await self.conn.fetch("SELECT * FROM plc_status_label ORDER BY id")

    async def create_status_label(self, label_name: str, description: str | None):
        return await self.conn.fetchrow(
            "INSERT INTO plc_status_label (label_name, description) VALUES ($1, $2) RETURNING *",
            label_name,
            description,
        )

    async def list_quality_labels(self):
        return await self.conn.fetch("SELECT * FROM plc_quality_label ORDER BY id")

    async def create_quality_label(self, label_name: str, description: str | None):
        return await self.conn.fetchrow(
            "INSERT INTO plc_quality_label (label_name, description) VALUES ($1, $2) RETURNING *",
            label_name,
            description,
        )

    # cell_status_mapping
    async def list_status_mappings(self, cell_id: int | None):
        if cell_id is not None:
            return await self.conn.fetch(
                "SELECT * FROM cell_status_mapping WHERE cell_id = $1 ORDER BY plc_raw_value",
                cell_id,
            )
        return await self.conn.fetch(
            "SELECT * FROM cell_status_mapping ORDER BY cell_id, plc_raw_value"
        )

    async def get_status_mapping(self, item_id: int):
        return await self.conn.fetchrow("SELECT * FROM cell_status_mapping WHERE id = $1", item_id)

    async def create_status_mapping(self, **f: Any):
        return await self.conn.fetchrow(
            """
            INSERT INTO cell_status_mapping
                (cell_id, plc_raw_value, status_code, plc_status_label_id, description)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
            """,
            f["cell_id"],
            f["plc_raw_value"],
            f["status_code"],
            f.get("plc_status_label_id"),
            f.get("description"),
        )

    async def update_status_mapping(self, item_id: int, fields: dict):
        if not fields:
            return await self.get_status_mapping(item_id)
        sets, vals = [], []
        for i, (col, val) in enumerate(fields.items(), 1):
            sets.append(f"{col} = ${i}")
            vals.append(val)
        sets.append("updated_at = NOW()")
        vals.append(item_id)
        return await self.conn.fetchrow(
            f"UPDATE cell_status_mapping SET {', '.join(sets)} WHERE id = ${len(vals)} RETURNING *",
            *vals,
        )

    async def delete_status_mapping(self, item_id: int):
        r = await self.conn.execute("DELETE FROM cell_status_mapping WHERE id = $1", item_id)
        return r.endswith(" 1")

    # cell_quality_mapping
    async def list_quality_mappings(self, cell_id: int | None):
        if cell_id is not None:
            return await self.conn.fetch(
                "SELECT * FROM cell_quality_mapping WHERE cell_id = $1 ORDER BY plc_raw_value",
                cell_id,
            )
        return await self.conn.fetch(
            "SELECT * FROM cell_quality_mapping ORDER BY cell_id, plc_raw_value"
        )

    async def get_quality_mapping(self, item_id: int):
        return await self.conn.fetchrow("SELECT * FROM cell_quality_mapping WHERE id = $1", item_id)

    async def create_quality_mapping(self, **f: Any):
        return await self.conn.fetchrow(
            """
            INSERT INTO cell_quality_mapping
                (cell_id, plc_raw_value, quality_code, plc_quality_label_id, description)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
            """,
            f["cell_id"],
            f["plc_raw_value"],
            f["quality_code"],
            f.get("plc_quality_label_id"),
            f.get("description"),
        )

    async def update_quality_mapping(self, item_id: int, fields: dict):
        if not fields:
            return await self.get_quality_mapping(item_id)
        sets, vals = [], []
        for i, (col, val) in enumerate(fields.items(), 1):
            sets.append(f"{col} = ${i}")
            vals.append(val)
        sets.append("updated_at = NOW()")
        vals.append(item_id)
        return await self.conn.fetchrow(
            f"UPDATE cell_quality_mapping SET {', '.join(sets)} WHERE id = ${len(vals)} RETURNING *",
            *vals,
        )

    async def delete_quality_mapping(self, item_id: int):
        r = await self.conn.execute("DELETE FROM cell_quality_mapping WHERE id = $1", item_id)
        return r.endswith(" 1")
