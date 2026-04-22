"""Signal repository."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import asyncpg


class SignalRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    # ── signal_tag ───────────────────────────────────
    async def list_tags(self, cell_id: int | None = None):
        if cell_id is not None:
            return await self.conn.fetch(
                "SELECT * FROM signal_tag WHERE cell_id = $1 ORDER BY id", cell_id
            )
        return await self.conn.fetch("SELECT * FROM signal_tag ORDER BY id")

    async def get_tag(self, tag_id: int):
        return await self.conn.fetchrow("SELECT * FROM signal_tag WHERE id = $1", tag_id)

    async def create_tag(self, **fields: Any):
        return await self.conn.fetchrow(
            """
            INSERT INTO signal_tag (cell_id, tag_address, tag_name, description, is_active, is_core)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
            """,
            fields["cell_id"],
            fields["tag_address"],
            fields["tag_name"],
            fields.get("description"),
            fields.get("is_active", True),
            fields.get("is_core", False),
        )

    async def update_tag(self, tag_id: int, fields: dict[str, Any]):
        if not fields:
            return await self.get_tag(tag_id)
        sets, vals = [], []
        for i, (col, val) in enumerate(fields.items(), 1):
            sets.append(f"{col} = ${i}")
            vals.append(val)
        sets.append("updated_at = NOW()")
        vals.append(tag_id)
        return await self.conn.fetchrow(
            f"UPDATE signal_tag SET {', '.join(sets)} WHERE id = ${len(vals)} RETURNING *",
            *vals,
        )

    async def delete_tag(self, tag_id: int):
        r = await self.conn.execute("DELETE FROM signal_tag WHERE id = $1", tag_id)
        return r.endswith(" 1")

    # ── process_signal_definition ───────────────────
    _DEF_SELECT = """
        SELECT psd.*, u.unit_name, st.type_name AS signal_type_name, sgt.tag_name
        FROM process_signal_definition psd
        LEFT JOIN unit u ON psd.unit_id = u.id
        LEFT JOIN signal_type st ON psd.signal_type_id = st.id
        LEFT JOIN signal_tag sgt ON psd.signal_tag_id = sgt.id
    """

    async def list_definitions(self, cell_id: int | None = None):
        if cell_id is not None:
            return await self.conn.fetch(
                self._DEF_SELECT + " WHERE psd.cell_id = $1 ORDER BY psd.id", cell_id
            )
        return await self.conn.fetch(self._DEF_SELECT + " ORDER BY psd.id")

    async def get_definition(self, def_id: int):
        return await self.conn.fetchrow(self._DEF_SELECT + " WHERE psd.id = $1", def_id)

    async def create_definition(self, **fields: Any):
        return await self.conn.fetchrow(
            """
            INSERT INTO process_signal_definition
                (cell_id, signal_tag_id, display_name, unit_id, signal_type_id)
            VALUES ($1, $2, $3, $4, $5) RETURNING id
            """,
            fields["cell_id"],
            fields["signal_tag_id"],
            fields["display_name"],
            fields.get("unit_id"),
            fields.get("signal_type_id"),
        )

    async def update_definition(self, def_id: int, fields: dict[str, Any]):
        if not fields:
            return await self.get_definition(def_id)
        sets, vals = [], []
        for i, (col, val) in enumerate(fields.items(), 1):
            sets.append(f"{col} = ${i}")
            vals.append(val)
        sets.append("updated_at = NOW()")
        vals.append(def_id)
        await self.conn.execute(
            f"UPDATE process_signal_definition SET {', '.join(sets)} WHERE id = ${len(vals)}",
            *vals,
        )
        return await self.get_definition(def_id)

    async def delete_definition(self, def_id: int):
        r = await self.conn.execute("DELETE FROM process_signal_definition WHERE id = $1", def_id)
        return r.endswith(" 1")

    # ── signal data ──────────────────────────────────
    async def signal_data(
        self,
        signal_def_id: int,
        window_start: datetime,
        window_end: datetime,
        limit: int,
    ):
        return await self.conn.fetch(
            """
            SELECT time, raw_value
            FROM process_signal_data
            WHERE signal_def_id = $1 AND time >= $2 AND time < $3
            ORDER BY time DESC
            LIMIT $4
            """,
            signal_def_id,
            window_start,
            window_end,
            limit,
        )

    async def signal_data_bucketed(
        self,
        signal_def_ids: list[int],
        window_start: datetime,
        window_end: datetime,
        bucket: timedelta,
    ):
        """Time-bucketed aggregation (avg/min/max) over multiple signals.

        Used by the MCP ``get_signal_trends`` tool — Investigator overlays
        3–4 correlated signals in one round-trip.
        """
        return await self.conn.fetch(
            """
            SELECT time_bucket($4, time) AS bucket,
                   signal_def_id,
                   AVG(raw_value)::float AS avg,
                   MIN(raw_value)::float AS min,
                   MAX(raw_value)::float AS max
            FROM process_signal_data
            WHERE signal_def_id = ANY($1::int[])
              AND time >= $2 AND time < $3
            GROUP BY bucket, signal_def_id
            ORDER BY bucket, signal_def_id
            """,
            signal_def_ids,
            window_start,
            window_end,
            bucket,
        )

    async def current_values(self, cell_ids: list[int] | None):
        if cell_ids:
            return await self.conn.fetch(
                "SELECT * FROM current_process_signals WHERE cell_id = ANY($1::int[]) ORDER BY signal_def_id",
                cell_ids,
            )
        return await self.conn.fetch("SELECT * FROM current_process_signals ORDER BY signal_def_id")

    # ── reference ────────────────────────────────────
    async def list_signal_types(self):
        return await self.conn.fetch("SELECT * FROM signal_type ORDER BY id")

    async def list_units(self):
        return await self.conn.fetch("SELECT * FROM unit ORDER BY id")
