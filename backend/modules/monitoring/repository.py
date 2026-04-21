"""Monitoring repository — current state + recent events."""

from __future__ import annotations

from datetime import datetime

import asyncpg


class MonitoringRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    async def current_status(self, cell_ids: list[int] | None):
        if cell_ids:
            return await self.conn.fetch(
                "SELECT * FROM current_cell_status WHERE cell_id = ANY($1::int[]) ORDER BY cell_id",
                cell_ids,
            )
        return await self.conn.fetch("SELECT * FROM current_cell_status ORDER BY cell_id")

    async def machine_status_events(
        self,
        cell_ids: list[int],
        window_start: datetime,
        window_end: datetime,
        limit: int,
    ):
        return await self.conn.fetch(
            """
            SELECT
                ms.time, ms.cell_id, c.name AS cell_name, l.name AS line_name,
                ms.status_code, msc.status_name, msc.status_category,
                ms.plc_status_raw, psl.label_name AS plc_label,
                ms.end_time,
                EXTRACT(EPOCH FROM (
                    LEAST(COALESCE(ms.end_time, NOW()), $3) - GREATEST(ms.time, $2)
                )) AS duration_seconds
            FROM machine_status ms
            JOIN cell c ON ms.cell_id = c.id
            JOIN line l ON c.parentid = l.id
            JOIN machine_status_code msc ON ms.status_code = msc.status_code
            LEFT JOIN cell_status_mapping csm
                ON csm.cell_id = ms.cell_id AND csm.plc_raw_value = ms.plc_status_raw
            LEFT JOIN plc_status_label psl ON csm.plc_status_label_id = psl.id
            WHERE ms.cell_id = ANY($1::int[])
              AND ms.time < $3
              AND (ms.end_time IS NULL OR ms.end_time > $2)
            ORDER BY ms.time DESC
            LIMIT $4
            """,
            cell_ids,
            window_start,
            window_end,
            limit,
        )

    async def production_events(
        self,
        cell_ids: list[int],
        window_start: datetime,
        window_end: datetime,
        limit: int,
        quality_codes: list[int] | None,
    ):
        sql = """
            SELECT
                pe.time, pe.cell_id, c.name AS cell_name, l.name AS line_name,
                pe.piece_counter,
                pe.piece_quality AS quality_code,
                qc.quality_name, qc.is_conformant,
                pe.plc_quality_raw,
                pql.label_name AS plc_label,
                pe.status_code,
                msc.status_name
            FROM production_event pe
            JOIN cell c ON pe.cell_id = c.id
            JOIN line l ON c.parentid = l.id
            JOIN quality_code qc ON pe.piece_quality = qc.quality_code
            JOIN machine_status_code msc ON pe.status_code = msc.status_code
            LEFT JOIN cell_quality_mapping cqm
                ON cqm.cell_id = pe.cell_id AND cqm.plc_raw_value = pe.plc_quality_raw
            LEFT JOIN plc_quality_label pql ON cqm.plc_quality_label_id = pql.id
            WHERE pe.cell_id = ANY($1::int[])
              AND pe.time >= $2 AND pe.time < $3
        """
        params: list = [cell_ids, window_start, window_end]
        if quality_codes:
            sql += " AND pe.piece_quality = ANY($4::int[]) ORDER BY pe.time DESC LIMIT $5"
            params.extend([quality_codes, limit])
        else:
            sql += " ORDER BY pe.time DESC LIMIT $4"
            params.append(limit)
        return await self.conn.fetch(sql, *params)
