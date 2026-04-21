"""Logbook repository."""

from __future__ import annotations

from datetime import datetime

import asyncpg
from core.db_helpers import must


class LogbookRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    _SELECT = """
        SELECT le.*, c.name AS cell_name, u.username AS author_username
        FROM logbook_entry le
        JOIN cell c ON le.cell_id = c.id
        LEFT JOIN users u ON le.author_id = u.id
    """

    async def list(
        self,
        cell_id: int | None,
        category: str | None,
        severity: str | None,
        window_start: datetime | None,
        window_end: datetime | None,
        limit: int,
    ):
        clauses, params = [], []
        if cell_id is not None:
            params.append(cell_id)
            clauses.append(f"le.cell_id = ${len(params)}")
        if category is not None:
            params.append(category)
            clauses.append(f"le.category = ${len(params)}")
        if severity is not None:
            params.append(severity)
            clauses.append(f"le.severity = ${len(params)}")
        if window_start is not None:
            params.append(window_start)
            clauses.append(f"le.entry_time >= ${len(params)}")
        if window_end is not None:
            params.append(window_end)
            clauses.append(f"le.entry_time < ${len(params)}")

        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        params.append(limit)
        sql = f"{self._SELECT} {where} ORDER BY le.entry_time DESC LIMIT ${len(params)}"
        return await self.conn.fetch(sql, *params)

    async def get(self, entry_id: int):
        return await self.conn.fetchrow(self._SELECT + " WHERE le.id = $1", entry_id)

    async def create(
        self,
        *,
        cell_id: int,
        author_id: int | None,
        category: str,
        severity: str,
        content: str,
        related_signal_def_id: int | None,
        entry_time: datetime | None,
    ):
        row = must(
            await self.conn.fetchrow(
                """
            INSERT INTO logbook_entry
                (cell_id, author_id, entry_time, category, severity, content, related_signal_def_id)
            VALUES ($1, $2, COALESCE($3, NOW()), $4, $5, $6, $7)
            RETURNING id
            """,
                cell_id,
                author_id,
                entry_time,
                category,
                severity,
                content,
                related_signal_def_id,
            )
        )
        return await self.get(row["id"])
