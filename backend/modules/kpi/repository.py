"""KPI repository — wraps fn_oee, fn_oee_bucketed, fn_mttr, fn_mtbf + production stats live."""

from __future__ import annotations

from datetime import datetime, timedelta

import asyncpg
from core.db_helpers import must


class KpiRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    async def oee(self, cell_ids: list[int], window_start: datetime, window_end: datetime):
        return await self.conn.fetchrow(
            "SELECT * FROM fn_oee($1::int[], $2, $3)",
            cell_ids,
            window_start,
            window_end,
        )

    async def oee_bucketed(
        self,
        cell_ids: list[int],
        window_start: datetime,
        window_end: datetime,
        bucket: timedelta,
    ):
        return await self.conn.fetch(
            "SELECT * FROM fn_oee_bucketed($1::int[], $2, $3, $4)",
            cell_ids,
            window_start,
            window_end,
            bucket,
        )

    async def mttr(
        self, cell_ids: list[int], window_start: datetime, window_end: datetime
    ) -> float | None:
        return await self.conn.fetchval(
            "SELECT fn_mttr($1::int[], $2, $3)",
            cell_ids,
            window_start,
            window_end,
        )

    async def mtbf(
        self, cell_ids: list[int], window_start: datetime, window_end: datetime
    ) -> float | None:
        return await self.conn.fetchval(
            "SELECT fn_mtbf($1::int[], $2, $3)",
            cell_ids,
            window_start,
            window_end,
        )

    async def production_stats(
        self, cell_ids: list[int], window_start: datetime, window_end: datetime
    ) -> dict:
        """Live aggregation from machine_status durations + production_event counts."""
        durations = await self.conn.fetch(
            """
            SELECT msc.status_category, COALESCE(SUM(d.duration_secs), 0) AS secs
            FROM fn_status_durations($1::int[], $2, $3) d
            JOIN machine_status_code msc ON d.status_code = msc.status_code
            GROUP BY msc.status_category
            """,
            cell_ids,
            window_start,
            window_end,
        )
        per_cat = {r["status_category"]: float(r["secs"] or 0) for r in durations}
        pieces = must(
            await self.conn.fetchrow(
                """
            SELECT
                COUNT(*) AS total_pieces,
                COUNT(*) FILTER (WHERE qc.is_conformant) AS good_pieces
            FROM production_event pe
            JOIN quality_code qc ON pe.piece_quality = qc.quality_code
            WHERE pe.cell_id = ANY($1::int[])
              AND pe.time >= $2 AND pe.time < $3
            """,
                cell_ids,
                window_start,
                window_end,
            )
        )
        return {
            "productive_seconds": per_cat.get("running", 0.0),
            "unplanned_stop_seconds": per_cat.get("unplanned_stop", 0.0),
            "planned_stop_seconds": per_cat.get("planned_stop", 0.0),
            "total_pieces": int(pieces["total_pieces"] or 0),
            "good_pieces": int(pieces["good_pieces"] or 0),
        }

    async def quality_by_cell(
        self, cell_ids: list[int], window_start: datetime, window_end: datetime
    ):
        return await self.conn.fetch(
            """
            SELECT
                c.id AS cell_id,
                c.name AS cell_name,
                l.name AS line_name,
                COUNT(pe.*) AS total_pieces,
                COUNT(pe.*) FILTER (WHERE qc.is_conformant) AS good_pieces,
                COUNT(pe.*) FILTER (WHERE qc.is_conformant = FALSE) AS bad_pieces
            FROM cell c
            JOIN line l ON c.parentid = l.id
            LEFT JOIN production_event pe
                ON pe.cell_id = c.id AND pe.time >= $2 AND pe.time < $3
            LEFT JOIN quality_code qc ON pe.piece_quality = qc.quality_code
            WHERE c.id = ANY($1::int[])
            GROUP BY c.id, c.name, l.name
            ORDER BY c.id
            """,
            cell_ids,
            window_start,
            window_end,
        )
