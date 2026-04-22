"""KB + failure history repository."""

from __future__ import annotations

from typing import Any

import asyncpg
from core.exceptions import ValidationFailedError
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

    async def _assert_thresholds_cover_signal_keys(
        self, cell_id: int, structured_data: Any
    ) -> None:
        """Refuse upserts that would orphan a process_signal_definition.kb_threshold_key.

        The mapping signal → KB threshold is tracked by the explicit
        ``process_signal_definition.kb_threshold_key`` column (migration 008).
        Tools like ``get_signal_anomalies`` rely on every referenced key being
        present in ``equipment_kb.structured_data.thresholds``. Silently dropping
        a referenced key broke anomaly detection in issue #69 — guard against it.
        """
        if not isinstance(structured_data, dict):
            return
        rows = await self.conn.fetch(
            "SELECT DISTINCT kb_threshold_key FROM process_signal_definition "
            "WHERE cell_id = $1 AND kb_threshold_key IS NOT NULL",
            cell_id,
        )
        required = {r["kb_threshold_key"] for r in rows}
        if not required:
            return
        provided = set((structured_data.get("thresholds") or {}).keys())
        missing = sorted(required - provided)
        if missing:
            raise ValidationFailedError(
                "structured_data.thresholds is missing keys referenced by "
                f"process_signal_definition.kb_threshold_key for cell {cell_id}: "
                f"{missing}. Either include these keys in your KB upload, or first "
                "NULL out the corresponding kb_threshold_key on the signal_def(s)."
            )

    async def upsert(self, fields: dict[str, Any]):
        cell_id = fields["cell_id"]
        if "structured_data" in fields:
            await self._assert_thresholds_cover_signal_keys(cell_id, fields["structured_data"])
        f = encode_fields(fields, JSON_FIELDS)
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
