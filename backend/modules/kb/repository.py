"""KB + failure history repository."""

from __future__ import annotations

from typing import Any

import asyncpg
from core.json_fields import encode_fields

JSON_FIELDS = (
    "structured_data",
    "parts_replaced",
    "signal_patterns",
)


class KbRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    _SELECT = """
        SELECT k.*, c.name AS cell_name
        FROM equipment_kb k
        JOIN cell c ON k.cell_id = c.id
    """

    async def list(self):
        return await self.conn.fetch(self._SELECT + " ORDER BY k.cell_id")

    async def get_by_cell(self, cell_id: int):
        return await self.conn.fetchrow(self._SELECT + " WHERE k.cell_id = $1", cell_id)

    async def upsert(self, fields: dict[str, Any]):
        f = encode_fields(fields, JSON_FIELDS)
        cell_id = f["cell_id"]
        cols = list(f.keys())
        placeholders = ", ".join(f"${i + 1}" for i in range(len(cols)))
        update_cols = [c for c in cols if c != "cell_id"]
        set_clauses = (
            ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols) + ", last_updated_at = NOW()"
        )
        sql = (
            f"INSERT INTO equipment_kb ({', '.join(cols)}) "
            f"VALUES ({placeholders}) "
            f"ON CONFLICT (cell_id) DO UPDATE SET {set_clauses} "
            f"RETURNING id"
        )
        await self.conn.execute(sql, *f.values())
        return await self.get_by_cell(cell_id)

    # ── failure history ─────────────────────────────
    _FH_SELECT = """
        SELECT fh.*, c.name AS cell_name
        FROM failure_history fh
        JOIN cell c ON fh.cell_id = c.id
    """

    async def list_failures(self, cell_id: int | None, limit: int):
        if cell_id is not None:
            return await self.conn.fetch(
                self._FH_SELECT + " WHERE fh.cell_id = $1 "
                "ORDER BY fh.failure_time DESC LIMIT $2",
                cell_id,
                limit,
            )
        return await self.conn.fetch(
            self._FH_SELECT + " ORDER BY fh.failure_time DESC LIMIT $1", limit
        )
