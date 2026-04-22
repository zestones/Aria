"""End-to-end smoke test for the ARIA MCP server (issue #69 regression guard).

Runnable script — exercises every tool over the live HTTP transport and asserts
that ``get_signal_anomalies`` returns a non-zero count when ground-truth signal
data exceeds KB thresholds. Catches the silent-degradation class of bug that
prompted issue #69 (KB drift orphaned every kb_threshold_key, tool returned
empty list with no error).

Requires a fully running stack:
    docker compose up -d
    make db.seed.p02   # ensure canonical KB

Run with:
    make backend.smoke.mcp
or:
    python backend/tests/e2e/aria_mcp_smoke.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

URL = os.environ.get("ARIA_MCP_URL", "http://localhost:8000/mcp/")


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def _call(session: ClientSession, name: str, args: dict) -> object:
    res = await session.call_tool(name, arguments=args)
    if res.isError:
        raise AssertionError(f"{name} returned isError: {res.content}")
    payload = res.structuredContent
    if payload is None and res.content:
        first = res.content[0]
        text = getattr(first, "text", None)
        if text is None:
            raise AssertionError(f"{name} returned non-text content: {type(first).__name__}")
        payload = json.loads(text)
    if (
        isinstance(payload, dict)
        and set(payload.keys()) == {"result"}
        and isinstance(payload["result"], list)
    ):
        return payload["result"]
    return payload


async def main() -> int:
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=24)
    cell_id = 1  # P-02

    async with streamablehttp_client(URL) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools = await session.list_tools()
            names = {t.name for t in tools.tools}
            expected = {
                "get_oee",
                "get_mtbf",
                "get_mttr",
                "get_downtime_events",
                "get_signal_trends",
                "get_signal_anomalies",
                "get_current_signals",
                # M2.4 (issue #11) — human context + hierarchy
                "get_logbook_entries",
                "get_shift_assignments",
                "get_work_orders",
                "list_cells",
                # M2.5 (issue #12) — KB tools
                "get_equipment_kb",
                "get_failure_history",
                "update_equipment_kb",
                # M2.6 (issue #13) — production tools
                "get_quality_metrics",
                "get_production_stats",
            }
            assert expected <= names, f"missing tools: {expected - names}"
            print(f"[OK] tools/list -> {len(names)} tools, all expected ARIA tools present")

            window = {"window_start": _iso(start), "window_end": _iso(end)}
            cells = {"cell_ids": [cell_id], **window}

            oee = await _call(session, "get_oee", cells)
            assert isinstance(oee, dict) and "oee" in oee
            print(f"[OK] get_oee -> {oee}")

            oee_b = await _call(session, "get_oee", {**cells, "bucket_minutes": 60})
            assert isinstance(oee_b, dict) and "buckets" in oee_b
            print(f"[OK] get_oee bucketed -> {len(oee_b['buckets'])} buckets")

            mtbf = await _call(session, "get_mtbf", cells)
            assert isinstance(mtbf, dict) and "mtbf_seconds" in mtbf
            print(f"[OK] get_mtbf -> {mtbf}")

            mttr = await _call(session, "get_mttr", cells)
            assert isinstance(mttr, dict) and "mttr_seconds" in mttr
            print(f"[OK] get_mttr -> {mttr}")

            dt_ev = await _call(session, "get_downtime_events", cells)
            assert isinstance(dt_ev, list)
            print(f"[OK] get_downtime_events -> {len(dt_ev)} categories")

            cur = await _call(session, "get_current_signals", {"cell_id": cell_id})
            assert isinstance(cur, list) and len(cur) > 0
            sig_ids = [r["signal_def_id"] for r in cur]
            print(
                f"[OK] get_current_signals -> {len(cur)} signals: "
                f"{[(r['display_name'], r['raw_value']) for r in cur]}"
            )

            trends = await _call(
                session,
                "get_signal_trends",
                {"signal_def_ids": sig_ids, **window, "aggregation": "1h"},
            )
            assert isinstance(trends, list) and len(trends) > 0
            print(
                f"[OK] get_signal_trends ({len(sig_ids)} signals, 1h buckets) -> {len(trends)} rows"
            )

            # Critical assertion: with the canonical P-02 KB + 24h of simulator data,
            # at least one threshold breach MUST be present. A bare [] here means
            # silent KB drift — the exact regression class covered by issue #69.
            anom = await _call(session, "get_signal_anomalies", {"cell_id": cell_id, **window})
            assert isinstance(anom, list), f"expected list, got {type(anom).__name__}"
            assert len(anom) > 0, (
                "REGRESSION: get_signal_anomalies returned 0 breaches over a 24h window. "
                "This usually means equipment_kb.structured_data drifted. "
                "Run `make db.seed.p02` and re-run."
            )
            print(f"[OK] get_signal_anomalies -> {len(anom)} breach events")
            print(f"     sample: {anom[0]}")

            # TZ guard
            try:
                await _call(
                    session,
                    "get_oee",
                    {
                        "cell_ids": [cell_id],
                        "window_start": "2026-04-22T13:00:00",
                        "window_end": _iso(end),
                    },
                )
                raise AssertionError("naive datetime must be rejected")
            except AssertionError as e:
                if "must be rejected" in str(e):
                    raise
                print(f"[OK] naive datetime rejected: {type(e).__name__}")
            except Exception as e:
                print(f"[OK] naive datetime rejected: {type(e).__name__}")

            # ---- M2.4 human-context tools (issue #11) ----
            cells_all = await _call(session, "list_cells", {})
            assert isinstance(cells_all, list) and len(cells_all) > 0
            assert any(c["name"] == "P-02" for c in cells_all), "P-02 not in list_cells output"
            print(f"[OK] list_cells -> {len(cells_all)} cells (P-02 present)")

            logbook = await _call(session, "get_logbook_entries", {"cell_id": cell_id, **window})
            assert (
                isinstance(logbook, list) and len(logbook) > 0
            ), "logbook_entry seed (006) empty — `get_logbook_entries` must return rows for P-02"
            print(f"[OK] get_logbook_entries -> {len(logbook)} entries")

            today = datetime.now(timezone.utc).date()
            shifts = await _call(
                session,
                "get_shift_assignments",
                {
                    "cell_id": cell_id,
                    "date_start": (today - timedelta(days=7)).isoformat(),
                    "date_end": today.isoformat(),
                },
            )
            assert (
                isinstance(shifts, list) and len(shifts) > 0
            ), "shift_assignment seed (seeds/p02_human_context.sql) empty"
            print(f"[OK] get_shift_assignments -> {len(shifts)} assignments")

            wos = await _call(session, "get_work_orders", {"cell_id": cell_id})
            assert (
                isinstance(wos, list) and len(wos) > 0
            ), "work_order seed (seeds/p02_human_context.sql) empty"
            print(f"[OK] get_work_orders -> {len(wos)} work orders")

            wos_critical = await _call(
                session,
                "get_work_orders",
                {"cell_id": cell_id, "priority": "critical", "generated_by_agent": True},
            )
            assert (
                isinstance(wos_critical, list) and len(wos_critical) > 0
            ), "audit §1.2 filters wired but no agent-generated critical WO returned"
            print(
                f"[OK] get_work_orders (priority=critical, agent=True) -> "
                f"{len(wos_critical)} match"
            )

            # ---- M2.5 KB tools (issue #12) ----
            kb_before = await _call(session, "get_equipment_kb", {"cell_id": cell_id})
            assert isinstance(kb_before, dict) and isinstance(
                kb_before["structured_data"], dict
            ), "audit §5: structured_data must be a parsed dict, not a raw asyncpg string"
            print(
                f"[OK] get_equipment_kb -> version="
                f"{kb_before['structured_data'].get('kb_meta', {}).get('version')}, "
                f"completeness={kb_before['confidence_score']}"
            )

            failures = await _call(
                session, "get_failure_history", {"cell_id": cell_id, "limit": 10}
            )
            assert isinstance(failures, list)
            print(f"[OK] get_failure_history -> {len(failures)} failures")

            vib_before = (
                kb_before["structured_data"]
                .get("thresholds", {})
                .get("vibration_mm_s", {})
                .get("alert")
            )
            assert vib_before is not None, "P-02 KB seed must have vibration_mm_s.alert"
            new_alert = float(vib_before) + 0.1
            updated = await _call(
                session,
                "update_equipment_kb",
                {
                    "cell_id": cell_id,
                    "structured_data_patch": {
                        "thresholds": {"vibration_mm_s": {"alert": new_alert}}
                    },
                    "source": "e2e_smoke",
                    "calibrated_by": "smoke_test",
                },
            )
            assert isinstance(updated, dict)
            sd = updated["structured_data"]
            assert (
                sd["thresholds"]["vibration_mm_s"]["alert"] == new_alert
            ), "audit §1: leaf-level patch must be visible via get_equipment_kb"
            log = sd.get("calibration_log") or []
            assert len(log) >= 1, "audit §2: calibration_log must contain a new entry"
            assert log[-1]["calibrated_by"] == "smoke_test"
            assert log[-1]["source"] == "e2e_smoke"
            new_version = sd.get("kb_meta", {}).get("version")
            old_version = kb_before["structured_data"].get("kb_meta", {}).get("version", 1)
            assert new_version == old_version + 1, "audit §3: kb_meta.version must auto-bump"
            print(
                f"[OK] update_equipment_kb -> alert={new_alert}, version={new_version}, "
                f"calibration_log entries={len(log)}"
            )

            # Restore the original threshold so re-running the smoke is idempotent.
            await _call(
                session,
                "update_equipment_kb",
                {
                    "cell_id": cell_id,
                    "structured_data_patch": {
                        "thresholds": {"vibration_mm_s": {"alert": float(vib_before)}}
                    },
                    "source": "e2e_smoke",
                    "calibrated_by": "smoke_test",
                },
            )

            # ---- M2.6 production tools (issue #13) ----
            quality = await _call(session, "get_quality_metrics", cells)
            assert isinstance(quality, list) and len(quality) > 0
            row = quality[0]
            assert {
                "cell_id",
                "cell_name",
                "line_name",
                "total_pieces",
                "good_pieces",
                "bad_pieces",
                "quality_rate",
            } <= set(row), f"missing fields in get_quality_metrics row: {set(row)}"
            print(
                f"[OK] get_quality_metrics -> {len(quality)} cell(s), "
                f"total={row['total_pieces']}, good={row['good_pieces']}, "
                f"quality_rate={row['quality_rate']}"
            )

            prod = await _call(session, "get_production_stats", cells)
            assert isinstance(prod, dict)
            assert {
                "productive_seconds",
                "unplanned_stop_seconds",
                "planned_stop_seconds",
                "total_pieces",
                "good_pieces",
                "bad_pieces",
            } <= set(prod)
            print(
                f"[OK] get_production_stats -> total_pieces={prod['total_pieces']}, productive_s={prod['productive_seconds']:.0f}"
            )

    print("\nALL TOOLS WORK END-TO-END")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
