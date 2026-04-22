"""Per-tool isolation smoke for the ARIA MCP server (issue #15 — M2.8).

Standalone script (not pytest-collected) that exercises every registered MCP
tool **directly through the ``MCPClient`` singleton** on the canonical P-02
seed (cell_id=1). Failures here block M3 (KB Builder) and M4 (Sentinel +
Investigator agent loops) — debugging an agent loop with a broken tool is
hell.

Differs from ``tests/e2e/aria_mcp_smoke.py``:
  * That script uses raw ``mcp.client.streamable_http_client`` to validate the
    transport contract.
  * **This** script uses the ``aria_mcp.client.MCPClient`` wrapper that the
    Investigator/Sentinel agents will actually consume — so it catches bugs
    in the wrapper layer (schema cache, ``ToolCallResult`` shape, error
    semantics) on top of tool correctness.

Per-tool assertion rules (audit §3 of issue #15):
  * Reads (``get_*``, ``list_*``): ``is_error=False`` + at least one expected
    business key in the payload.
  * Writes (``update_equipment_kb``): round-trip — patch a leaf, read back,
    confirm the leaf is the new value, then **restore** the original value in
    ``finally`` so the script is idempotent and the demo seed stays clean.

Pre-requisites:
    docker compose up -d
    make db.seed.p02   # canonical KB

Run:
    make backend.smoke.tools
or:
    cd backend && PYTHONPATH=. python tests/integration/aria_mcp/tools_p02_isolation.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

# Allow ``python tests/integration/aria_mcp/tools_p02_isolation.py`` from the
# backend root by injecting it onto sys.path when invoked directly.
if __package__ is None or __package__ == "":
    _BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    if _BACKEND_ROOT not in sys.path:
        sys.path.insert(0, _BACKEND_ROOT)

from aria_mcp.client import MCPClient, ToolCallResult, mcp_client  # noqa: E402

CELL_ID = 1  # P-02 in the canonical seed (migration 006)
EXPECTED_TOOLS: set[str] = {
    # M2.2 KPI
    "get_oee",
    "get_mtbf",
    "get_mttr",
    "get_downtime_events",
    # M2.3 signals
    "get_signal_trends",
    "get_signal_anomalies",
    "get_current_signals",
    # M2.4 human context + hierarchy
    "get_logbook_entries",
    "get_shift_assignments",
    "get_work_orders",
    "list_cells",
    # M2.5 KB
    "get_equipment_kb",
    "get_failure_history",
    "update_equipment_kb",
    # M2.6 production
    "get_quality_metrics",
    "get_production_stats",
}


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _payload(result: ToolCallResult) -> Any:
    """Decode a tool result; flatten the FastMCP ``{"result": [...]}`` wrapper."""
    if result.is_error:
        raise AssertionError(f"tool returned is_error=True: {result.content}")
    if not result.content:
        return None
    data = json.loads(result.content)
    if (
        isinstance(data, dict)
        and set(data.keys()) == {"result"}
        and isinstance(data["result"], list)
    ):
        return data["result"]
    return data


async def _check(
    client: MCPClient,
    name: str,
    args: dict[str, Any],
    expected_keys: set[str] | None = None,
    list_non_empty: bool = False,
) -> Any:
    """Call a read tool, assert success + expected business keys."""
    res = await client.call_tool(name, args)
    payload = _payload(res)
    if list_non_empty:
        assert isinstance(payload, list) and len(payload) > 0, (
            f"{name}: expected non-empty list, got {type(payload).__name__} len="
            f"{len(payload) if hasattr(payload, '__len__') else 'n/a'}"
        )
    if expected_keys is not None:
        sample = payload[0] if isinstance(payload, list) else payload
        assert isinstance(sample, dict) and expected_keys <= set(
            sample
        ), f"{name}: missing keys {expected_keys - set(sample)} in payload sample {sample!r}"
    print(f"[OK] {name}")
    return payload


async def main() -> int:
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=24)
    today = end.date()
    window = {"window_start": _iso(start), "window_end": _iso(end)}
    cells = {"cell_ids": [CELL_ID], **window}

    # Use a dedicated client so we never clobber the module singleton's cache
    # when invoked alongside other consumers in the same process.
    client = MCPClient(os.environ.get("ARIA_MCP_URL", mcp_client.url))

    # ---- discovery ----
    schemas = await client.get_tools_schema()
    names = {s["name"] for s in schemas}
    missing = EXPECTED_TOOLS - names
    assert not missing, f"missing tools on server: {missing}"
    print(f"[OK] tools discovered: {len(names)} (expected {len(EXPECTED_TOOLS)} present)")

    # ---- M2.2 KPI ----
    await _check(client, "get_oee", cells, expected_keys={"oee", "availability"})
    await _check(client, "get_mtbf", cells, expected_keys={"mtbf_seconds"})
    await _check(client, "get_mttr", cells, expected_keys={"mttr_seconds"})
    dt_ev = await _check(client, "get_downtime_events", cells, list_non_empty=False)
    assert isinstance(
        dt_ev, list
    ), f"get_downtime_events: expected list, got {type(dt_ev).__name__}"

    # ---- M2.3 signals ----
    cur = await _check(
        client,
        "get_current_signals",
        {"cell_id": CELL_ID},
        expected_keys={"signal_def_id", "raw_value", "display_name"},
        list_non_empty=True,
    )
    sig_ids = [r["signal_def_id"] for r in cur]
    await _check(
        client,
        "get_signal_trends",
        {"signal_def_ids": sig_ids, **window, "aggregation": "1h"},
        list_non_empty=True,
    )
    anom = await _check(
        client,
        "get_signal_anomalies",
        {"cell_id": CELL_ID, **window},
        list_non_empty=True,  # issue #69 regression guard
    )
    assert len(anom) > 0, (
        "REGRESSION: get_signal_anomalies returned 0 breaches on canonical P-02 KB. "
        "Likely KB drift — run `make db.seed.p02` and retry."
    )

    # ---- M2.4 context + hierarchy ----
    cells_all = await _check(
        client, "list_cells", {}, expected_keys={"id", "name"}, list_non_empty=True
    )
    assert any(c["name"] == "P-02" for c in cells_all), "P-02 missing from list_cells"

    await _check(
        client,
        "get_logbook_entries",
        {"cell_id": CELL_ID, **window},
        list_non_empty=True,
    )
    await _check(
        client,
        "get_shift_assignments",
        {
            "cell_id": CELL_ID,
            "date_start": (today - timedelta(days=7)).isoformat(),
            "date_end": today.isoformat(),
        },
        list_non_empty=True,
    )
    await _check(
        client,
        "get_work_orders",
        {"cell_id": CELL_ID},
        list_non_empty=True,
    )
    await _check(
        client,
        "get_work_orders",
        {"cell_id": CELL_ID, "priority": "critical", "generated_by_agent": True},
        list_non_empty=True,  # audit §1.2 filters wired
    )

    # ---- M2.5 KB ----
    kb_before = await _check(
        client,
        "get_equipment_kb",
        {"cell_id": CELL_ID},
        expected_keys={"structured_data", "confidence_score"},
    )
    assert isinstance(
        kb_before["structured_data"], dict
    ), "get_equipment_kb: structured_data must be a parsed dict (not raw asyncpg string)"
    await _check(
        client,
        "get_failure_history",
        {"cell_id": CELL_ID, "limit": 10},
        list_non_empty=False,
    )

    # Write tool — round-trip with restore in finally (audit §1 Option B-lite).
    # Tracker: post-M3 we should add a TEST-00 sentinel cell so writes never
    # touch the demo seed at all (audit §1 Option A).
    vib_before = (
        kb_before["structured_data"].get("thresholds", {}).get("vibration_mm_s", {}).get("alert")
    )
    assert vib_before is not None, "P-02 KB seed must have thresholds.vibration_mm_s.alert"
    new_alert = float(vib_before) + 0.1
    try:
        patched = await _check(
            client,
            "update_equipment_kb",
            {
                "cell_id": CELL_ID,
                "structured_data_patch": {"thresholds": {"vibration_mm_s": {"alert": new_alert}}},
                "source": "tools_p02_isolation",
                "calibrated_by": "isolation_smoke",
            },
            expected_keys={"structured_data"},
        )
        sd = patched["structured_data"]
        assert (
            sd["thresholds"]["vibration_mm_s"]["alert"] == new_alert
        ), "update_equipment_kb: leaf-level patch did not round-trip"
        log = sd.get("calibration_log") or []
        assert (
            log and log[-1]["calibrated_by"] == "isolation_smoke"
        ), "update_equipment_kb: calibration_log not appended"
    finally:
        # Restore — keeps the demo seed clean even if assertions above fail.
        restore = await client.call_tool(
            "update_equipment_kb",
            {
                "cell_id": CELL_ID,
                "structured_data_patch": {
                    "thresholds": {"vibration_mm_s": {"alert": float(vib_before)}}
                },
                "source": "tools_p02_isolation",
                "calibrated_by": "isolation_smoke",
            },
        )
        assert not restore.is_error, f"FAILED to restore P-02 KB: {restore.content}"

    # ---- M2.6 production ----
    quality = await _check(
        client,
        "get_quality_metrics",
        cells,
        expected_keys={
            "cell_id",
            "total_pieces",
            "good_pieces",
            "bad_pieces",
            "quality_rate",
        },
        list_non_empty=True,
    )
    assert quality[0]["total_pieces"] >= 0
    await _check(
        client,
        "get_production_stats",
        cells,
        expected_keys={
            "productive_seconds",
            "unplanned_stop_seconds",
            "planned_stop_seconds",
            "total_pieces",
            "good_pieces",
            "bad_pieces",
        },
    )

    # ---- error-path contract — bogus arg must surface as is_error=True, not raise ----
    bogus = await client.call_tool(
        "get_oee",
        {"cell_ids": [CELL_ID], "window_start": "bogus", "window_end": _iso(end)},
    )
    assert (
        bogus.is_error is True
    ), "MCPClient contract: tool-side validation errors must return is_error=True, not raise"
    print("[OK] error path: invalid args surface as is_error=True (no exception)")

    print(f"\nALL {len(EXPECTED_TOOLS)} TOOLS PASS ISOLATION SMOKE ON P-02 (cell_id={CELL_ID})")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
