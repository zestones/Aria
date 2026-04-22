"""Work order repository."""

from __future__ import annotations

from typing import Any

import asyncpg
from core.db_helpers import must
from core.json_fields import encode_fields

JSON_FIELDS = ("required_parts", "required_skills", "recommended_actions")


class WorkOrderRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    _SELECT = """
        SELECT wo.*, c.name AS cell_name, u.username AS assigned_to_username
        FROM work_order wo
        JOIN cell c ON wo.cell_id = c.id
        LEFT JOIN users u ON wo.assigned_to = u.id
    """

    async def list(
        self,
        cell_id: int | None,
        status: str | None,
        limit: int,
        date_start: Any | None = None,
        date_end: Any | None = None,
        priority: str | None = None,
        generated_by_agent: bool | None = None,
    ):
        clauses, params = [], []
        if cell_id is not None:
            params.append(cell_id)
            clauses.append(f"wo.cell_id = ${len(params)}")
        if status is not None:
            params.append(status)
            clauses.append(f"wo.status = ${len(params)}")
        if priority is not None:
            params.append(priority)
            clauses.append(f"wo.priority = ${len(params)}")
        if generated_by_agent is not None:
            params.append(generated_by_agent)
            clauses.append(f"wo.generated_by_agent = ${len(params)}")
        if date_start is not None:
            params.append(date_start)
            clauses.append(f"wo.created_at >= ${len(params)}")
        if date_end is not None:
            params.append(date_end)
            clauses.append(f"wo.created_at < ${len(params)}")
        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        params.append(limit)
        sql = f"{self._SELECT} {where} ORDER BY wo.created_at DESC LIMIT ${len(params)}"
        return await self.conn.fetch(sql, *params)

    async def get(self, item_id: int):
        return await self.conn.fetchrow(self._SELECT + " WHERE wo.id = $1", item_id)

    async def create(self, fields: dict[str, Any]):
        f = encode_fields(fields, JSON_FIELDS)
        cols = list(f.keys())
        placeholders = ", ".join(f"${i + 1}" for i in range(len(cols)))
        sql = f"INSERT INTO work_order ({', '.join(cols)}) " f"VALUES ({placeholders}) RETURNING id"
        row = must(await self.conn.fetchrow(sql, *f.values()))
        return await self.get(row["id"])

    async def update(self, item_id: int, fields: dict[str, Any]):
        if not fields:
            return await self.get(item_id)
        f = encode_fields(fields, JSON_FIELDS)
        sets, vals = [], []
        for i, (col, val) in enumerate(f.items(), 1):
            sets.append(f"{col} = ${i}")
            vals.append(val)
        vals.append(item_id)
        await self.conn.execute(
            f"UPDATE work_order SET {', '.join(sets)} WHERE id = ${len(vals)}",
            *vals,
        )
        return await self.get(item_id)

    async def delete(self, item_id: int):
        r = await self.conn.execute("DELETE FROM work_order WHERE id = $1", item_id)
        return r.endswith(" 1")
