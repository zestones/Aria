"""Signal tools (M2.3) — bucketed trends, threshold-driven anomalies, current values.

``get_signal_anomalies`` resolves the KB → signal mapping via the explicit
``process_signal_definition.kb_threshold_key`` column (added in migration 008),
not via fuzzy matching.
"""

from __future__ import annotations

from aria_mcp._common import parse_aggregation, with_conn
from aria_mcp.server import mcp
from core.datetime_helpers import parse_tz_aware
from core.thresholds import evaluate_threshold
from modules.kb.kb_schema import EquipmentKB
from modules.signal.repository import SignalRepository


@mcp.tool()
async def get_signal_trends(
    signal_def_ids: list[int],
    window_start: str,
    window_end: str,
    aggregation: str = "1m",
) -> list[dict]:
    """Bucketed time-series for one or more process signals.

    Args:
        signal_def_ids: List of ``process_signal_definition.id`` (non-empty).
            Multiple signals are returned interleaved so an Investigator
            agent can overlay correlated signals in one round-trip.
        window_start: ISO-8601 with TZ offset.
        window_end: ISO-8601 with TZ offset (exclusive).
        aggregation: Bucket size — one of ``10s, 30s, 1m, 5m, 15m, 1h, 1d``.

    Returns:
        List of ``{time: iso_str, signal_def_id: int, avg: float,
        min: float, max: float}`` ordered by ``(time, signal_def_id)``.
    """
    ws = parse_tz_aware(window_start)
    we = parse_tz_aware(window_end)
    bucket = parse_aggregation(aggregation)
    async with with_conn() as conn:
        rows = await SignalRepository(conn).signal_data_bucketed(signal_def_ids, ws, we, bucket)
    return [
        {
            "time": r["bucket"].isoformat(),
            "signal_def_id": r["signal_def_id"],
            "avg": float(r["avg"]) if r["avg"] is not None else None,
            "min": float(r["min"]) if r["min"] is not None else None,
            "max": float(r["max"]) if r["max"] is not None else None,
        }
        for r in rows
    ]


@mcp.tool()
async def get_signal_anomalies(
    cell_id: int,
    window_start: str,
    window_end: str,
) -> list[dict]:
    """Detect threshold breaches in process_signal_data against ``equipment_kb``.

    Maps each KB threshold key to its signal_def via the explicit
    ``process_signal_definition.kb_threshold_key`` column. Breach evaluation
    uses the unified ``core.thresholds.evaluate_threshold`` helper (handles
    both single-sided ``alert``/``trip`` and double-sided
    ``low_alert``/``high_alert`` shapes).

    Args:
        cell_id: Target cell.
        window_start: ISO-8601 with TZ.
        window_end: ISO-8601 with TZ.

    Returns:
        List of ``{signal_def_id, display_name, kb_key, time: iso_str,
        value: float, threshold_field: "alert"|"trip"|"low_alert"|"high_alert",
        threshold_value: float, severity: "alert"|"trip", direction: "high"|"low"}``
        ordered by time ascending. Empty list **only** when threshold evaluation
        ran cleanly and produced no breaches.

    Raises:
        ValueError: When the cell has no KB row, the KB has no thresholds, or
            none of its ``process_signal_definition.kb_threshold_key`` values
            match a key in the KB. These are configuration errors that would
            otherwise silently look like "no anomalies" (issue #69).
    """
    ws = parse_tz_aware(window_start)
    we = parse_tz_aware(window_end)
    async with with_conn() as conn:
        kb_row = await conn.fetchrow(
            "SELECT structured_data FROM equipment_kb WHERE cell_id = $1",
            cell_id,
        )
        if not kb_row or not kb_row["structured_data"]:
            raise ValueError(f"cell {cell_id} has no equipment_kb row; cannot evaluate anomalies")
        kb = EquipmentKB.model_validate_json(kb_row["structured_data"])
        if not kb.thresholds:
            raise ValueError(
                f"equipment_kb for cell {cell_id} has no thresholds; "
                "calibrate the KB before requesting anomalies"
            )

        sig_rows = await conn.fetch(
            """
            SELECT id, display_name, kb_threshold_key
            FROM process_signal_definition
            WHERE cell_id = $1
              AND kb_threshold_key = ANY($2::text[])
            """,
            cell_id,
            list(kb.thresholds.keys()),
        )
        if not sig_rows:
            # Diagnose which side is misconfigured so the agent (or operator) knows
            # whether to fix the KB or the signal_def.kb_threshold_key column.
            sig_keys_rows = await conn.fetch(
                "SELECT DISTINCT kb_threshold_key FROM process_signal_definition "
                "WHERE cell_id = $1 AND kb_threshold_key IS NOT NULL",
                cell_id,
            )
            sig_keys = sorted({r["kb_threshold_key"] for r in sig_keys_rows})
            kb_keys = sorted(kb.thresholds.keys())
            raise ValueError(
                f"cell {cell_id}: no process_signal_definition.kb_threshold_key "
                f"matches a key in equipment_kb.thresholds. "
                f"signal_def keys={sig_keys}, kb keys={kb_keys}. "
                "Run `make db.seed.p02` (or fix the kb_threshold_key column) to recover."
            )

        sig_to_kb: dict[int, str] = {r["id"]: r["kb_threshold_key"] for r in sig_rows}
        sig_to_name: dict[int, str] = {r["id"]: r["display_name"] for r in sig_rows}

        data_rows = await conn.fetch(
            """
            SELECT time, signal_def_id, raw_value
            FROM process_signal_data
            WHERE signal_def_id = ANY($1::int[])
              AND time >= $2 AND time < $3
            ORDER BY time ASC
            """,
            list(sig_to_kb.keys()),
            ws,
            we,
        )

    out: list[dict] = []
    for row in data_rows:
        sig_id = row["signal_def_id"]
        kb_key = sig_to_kb[sig_id]
        result = evaluate_threshold(kb.thresholds[kb_key], float(row["raw_value"]))
        if not result["breached"]:
            continue
        out.append(
            {
                "signal_def_id": sig_id,
                "display_name": sig_to_name[sig_id],
                "kb_key": kb_key,
                "time": row["time"].isoformat(),
                "value": float(row["raw_value"]),
                "threshold_field": result["threshold_field"],
                "threshold_value": result["threshold_value"],
                "severity": result["severity"],
                "direction": result["direction"],
            }
        )
    return out


@mcp.tool()
async def get_current_signals(cell_id: int) -> list[dict]:
    """Latest value for every active signal on a cell (wraps ``current_process_signals``).

    Used by the Investigator agent to grab "all signals on this cell right now"
    in a single round-trip rather than iterating per-signal.

    Args:
        cell_id: Target cell.

    Returns:
        List of ``{signal_def_id, cell_id, cell_name, line_name, display_name,
        unit, signal_type, last_update: iso_str | null, raw_value: float | null}``.
    """
    async with with_conn() as conn:
        rows = await SignalRepository(conn).current_values([cell_id])
    return [
        {
            "signal_def_id": r["signal_def_id"],
            "cell_id": r["cell_id"],
            "cell_name": r["cell_name"],
            "line_name": r["line_name"],
            "display_name": r["display_name"],
            "unit": r["unit"],
            "signal_type": r["signal_type"],
            "last_update": r["last_update"].isoformat() if r["last_update"] else None,
            "raw_value": float(r["raw_value"]) if r["raw_value"] is not None else None,
        }
        for r in rows
    ]
