"""Shift repository."""

from __future__ import annotations

from datetime import date, time

import asyncpg
from core.db_helpers import must


class ShiftRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    _ASSIGN_SELECT = """
        SELECT sa.*, s.name AS shift_name,
               u.username, u.full_name,
               c.name AS cell_name
        FROM shift_assignment sa
        JOIN shift s ON sa.shift_id = s.id
        JOIN users u ON sa.user_id = u.id
        LEFT JOIN cell c ON sa.cell_id = c.id
    """

    async def list_shifts(self):
        return await self.conn.fetch("SELECT * FROM shift ORDER BY start_time")

    async def get_shift_at(self, current_time: time):
        """Return the shift active at the given local time (handles wrap-around)."""
        return await self.conn.fetchrow(
            """
            SELECT * FROM shift
            WHERE
              (start_time < end_time AND $1 >= start_time AND $1 < end_time)
              OR
              (start_time > end_time AND ($1 >= start_time OR $1 < end_time))
            LIMIT 1
            """,
            current_time,
        )

    async def list_assignments(
        self, assigned_date: date | None, cell_id: int | None, user_id: int | None
    ):
        clauses, params = [], []
        if assigned_date is not None:
            params.append(assigned_date)
            clauses.append(f"sa.assigned_date = ${len(params)}")
        if cell_id is not None:
            params.append(cell_id)
            clauses.append(f"sa.cell_id = ${len(params)}")
        if user_id is not None:
            params.append(user_id)
            clauses.append(f"sa.user_id = ${len(params)}")
        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        sql = f"{self._ASSIGN_SELECT} {where} ORDER BY sa.assigned_date DESC, sa.id"
        return await self.conn.fetch(sql, *params)

    async def list_assignments_for_range(
        self,
        date_start: date,
        date_end: date,
        cell_id: int | None = None,
        user_id: int | None = None,
    ):
        """Range variant used by MCP `get_shift_assignments` (audit §1, issue #11).

        ``date_end`` is inclusive — shift assignments are day-granular.
        """
        params: list[object] = [date_start, date_end]
        clauses = ["sa.assigned_date >= $1", "sa.assigned_date <= $2"]
        if cell_id is not None:
            params.append(cell_id)
            clauses.append(f"sa.cell_id = ${len(params)}")
        if user_id is not None:
            params.append(user_id)
            clauses.append(f"sa.user_id = ${len(params)}")
        sql = (
            f"{self._ASSIGN_SELECT} WHERE {' AND '.join(clauses)} "
            "ORDER BY sa.assigned_date DESC, sa.id"
        )
        return await self.conn.fetch(sql, *params)

    async def list_assignments_for_shift_date(self, shift_id: int, day: date):
        return await self.conn.fetch(
            self._ASSIGN_SELECT + " WHERE sa.shift_id = $1 AND sa.assigned_date = $2",
            shift_id,
            day,
        )

    async def create_assignment(
        self, shift_id: int, user_id: int, cell_id: int | None, assigned_date: date
    ):
        row = must(
            await self.conn.fetchrow(
                """
            INSERT INTO shift_assignment (shift_id, user_id, cell_id, assigned_date)
            VALUES ($1, $2, $3, $4) RETURNING id
            """,
                shift_id,
                user_id,
                cell_id,
                assigned_date,
            )
        )
        return await self.conn.fetchrow(self._ASSIGN_SELECT + " WHERE sa.id = $1", row["id"])
