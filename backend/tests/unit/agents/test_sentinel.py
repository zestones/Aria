"""Tests for ``agents.sentinel`` (issue #24 / M4.2).

Covers the acceptance items that are testable without a live DB / MCP:

- Threshold evaluation is delegated to ``get_signal_anomalies`` — Sentinel
  never compares raw thresholds itself. A cell with zero breaches produces
  zero work orders.
- ``ToolCallResult.is_error=True`` from the MCP tool logs a warning and
  skips the cell. The tick does NOT raise.
- A fresh breach opens exactly one ``work_order`` and broadcasts exactly
  one ``anomaly_detected`` + one ``ui_render(alert_banner)``. The
  ``anomaly_detected`` payload carries ``severity`` and ``direction``
  (audit recommendation 1, #23 cross-ref).
- A second breach on the same (cell, signal) within 30 minutes is
  debounced — no extra work orders.
- Cells with ``onboarding_complete=False`` are skipped.
- ``sentinel_loop`` survives an inner exception — the loop continues to
  the next tick instead of dying silently.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import pytest
from agents import sentinel as sentinel_mod

# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


@dataclass
class _ToolResult:
    content: str = "[]"
    is_error: bool = False


class _FakeMCP:
    """Minimal stand-in for ``mcp_client`` exposing only ``call_tool``."""

    def __init__(self, result_by_cell: dict[int, _ToolResult] | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._result_by_cell = result_by_cell or {}

    async def call_tool(self, name: str, args: dict[str, Any]) -> _ToolResult:
        self.calls.append((name, args))
        return self._result_by_cell.get(args.get("cell_id", -1), _ToolResult())


class _FakeWS:
    """Captures broadcast calls so tests can assert on payload shape."""

    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    async def broadcast(self, event_type: str, payload: dict[str, Any]) -> None:
        self.events.append((event_type, payload))


# ---------------------------------------------------------------------------
# DB fake — replaces ``db.pool.acquire()`` with an async context manager that
# returns a fake asyncpg Connection-like object.
# ---------------------------------------------------------------------------


class _FakeConn:
    def __init__(
        self,
        *,
        cells: list[dict[str, Any]] | None = None,
        existing_wo: int | None = None,
        wo_id_counter: list[int] | None = None,
    ) -> None:
        self._cells = cells or []
        self._existing_wo = existing_wo
        self._wo_id_counter = wo_id_counter if wo_id_counter is not None else [100]
        self.created_wo: list[dict[str, Any]] = []
        self.fetch_calls: list[tuple[str, tuple[Any, ...]]] = []

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        self.fetch_calls.append((query, args))
        # Only one fetch() path in Sentinel: the cells SELECT.
        return list(self._cells)

    async def fetchval(self, query: str, *args: Any) -> Any:
        # Only one fetchval() path: the debounce probe.
        return self._existing_wo

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any]:
        # Used by WorkOrderRepository.create → INSERT ... RETURNING id and
        # the follow-up SELECT. Emulate both paths with the same fake.
        if "INSERT INTO work_order" in query:
            new_id = self._wo_id_counter[0]
            self._wo_id_counter[0] += 1
            # Best-effort positional-arg capture for assertions.
            self.created_wo.append({"id": new_id, "args": args})
            return {"id": new_id}
        if "SELECT wo.*" in query:
            # Return the most recently created WO, flattened.
            if not self.created_wo:
                return {"id": 0}
            wo = self.created_wo[-1]
            return {"id": wo["id"], **{f"col_{i}": v for i, v in enumerate(wo["args"])}}
        return {}

    async def execute(self, query: str, *args: Any) -> str:
        return "OK"


@dataclass
class _FakePool:
    conn: _FakeConn

    def acquire(self) -> "_FakePoolCtx":
        return _FakePoolCtx(self.conn)


@dataclass
class _FakePoolCtx:
    conn: _FakeConn

    async def __aenter__(self) -> _FakeConn:
        return self.conn

    async def __aexit__(self, *a: Any) -> None:
        return None


@dataclass
class _FakeDB:
    pool: _FakePool = field(default_factory=lambda: _FakePool(_FakeConn()))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_logged_once() -> None:
    """Reset the one-shot startup-log flag between tests."""
    sentinel_mod._logged_cells = False


@pytest.fixture
def patch_sentinel(monkeypatch: pytest.MonkeyPatch):
    """Inject a fake db, mcp, ws into ``sentinel`` module namespace."""

    def _install(
        *,
        cells: list[dict[str, Any]],
        mcp_results: dict[int, _ToolResult] | None = None,
        existing_wo: int | None = None,
    ) -> tuple[_FakeMCP, _FakeWS, _FakeConn]:
        conn = _FakeConn(cells=cells, existing_wo=existing_wo)
        db_fake = _FakeDB(pool=_FakePool(conn))
        mcp = _FakeMCP(result_by_cell=mcp_results)
        ws = _FakeWS()
        monkeypatch.setattr(sentinel_mod, "db", db_fake)
        monkeypatch.setattr(sentinel_mod, "mcp_client", mcp)
        monkeypatch.setattr(sentinel_mod, "ws_manager", ws)
        return mcp, ws, conn

    return _install


def _breach(
    *,
    signal_def_id: int = 10,
    display_name: str = "Vibration",
    kb_key: str = "vibration_mm_s",
    value: float = 5.0,
    threshold_value: float = 4.5,
    severity: str = "alert",
    direction: str = "high",
    threshold_field: str = "alert",
    time: str | None = None,
) -> dict[str, Any]:
    return {
        "signal_def_id": signal_def_id,
        "display_name": display_name,
        "kb_key": kb_key,
        "breach_start": time or datetime.now(timezone.utc).isoformat(),
        "breach_end": time or datetime.now(timezone.utc).isoformat(),
        "peak_value": value,
        "sample_count": 1,
        "duration_seconds": 0,
        "threshold_field": threshold_field,
        "threshold_value": threshold_value,
        "severity": severity,
        "direction": direction,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_cells_is_noop(patch_sentinel) -> None:
    mcp, ws, _conn = patch_sentinel(cells=[])
    await sentinel_mod._sentinel_tick()
    assert mcp.calls == []
    assert ws.events == []


@pytest.mark.asyncio
async def test_skips_cells_not_onboarded(patch_sentinel) -> None:
    mcp, ws, _conn = patch_sentinel(
        cells=[
            {"cell_id": 1, "cell_name": "P-01", "onboarding_complete": False},
            {"cell_id": 2, "cell_name": "P-02", "onboarding_complete": True},
        ]
    )
    await sentinel_mod._sentinel_tick()
    # Only the onboarded cell was probed.
    assert len(mcp.calls) == 1
    assert mcp.calls[0][1]["cell_id"] == 2
    assert ws.events == []


@pytest.mark.asyncio
async def test_no_breaches_emits_no_events(patch_sentinel) -> None:
    mcp, ws, _conn = patch_sentinel(
        cells=[{"cell_id": 2, "cell_name": "P-02", "onboarding_complete": True}],
        mcp_results={2: _ToolResult(content="[]")},
    )
    await sentinel_mod._sentinel_tick()
    assert len(mcp.calls) == 1
    assert ws.events == []


@pytest.mark.asyncio
async def test_is_error_logs_and_continues(
    patch_sentinel, caplog: pytest.LogCaptureFixture
) -> None:
    mcp, ws, _conn = patch_sentinel(
        cells=[
            {"cell_id": 1, "cell_name": "P-01", "onboarding_complete": True},
            {"cell_id": 2, "cell_name": "P-02", "onboarding_complete": True},
        ],
        mcp_results={
            1: _ToolResult(content="KB misconfigured", is_error=True),
            2: _ToolResult(content="[]"),
        },
    )
    with caplog.at_level("WARNING"):
        await sentinel_mod._sentinel_tick()

    assert any("cell 1" in rec.message for rec in caplog.records)
    # Cell 2 was still probed after cell 1's failure.
    cell_ids = [call[1]["cell_id"] for call in mcp.calls]
    assert cell_ids == [1, 2]
    # No events — cell 1 errored, cell 2 had no breaches.
    assert ws.events == []


@pytest.mark.asyncio
async def test_fresh_breach_creates_wo_and_broadcasts(patch_sentinel) -> None:
    breach = _breach(
        signal_def_id=10, value=5.0, threshold_value=4.5, severity="alert", direction="high"
    )
    _mcp, ws, conn = patch_sentinel(
        cells=[{"cell_id": 2, "cell_name": "P-02", "onboarding_complete": True}],
        mcp_results={2: _ToolResult(content=json.dumps([breach]))},
    )

    await sentinel_mod._sentinel_tick()

    # Exactly one work_order was created.
    assert len(conn.created_wo) == 1
    # Exactly two broadcasts, in order: anomaly_detected, ui_render.
    assert [e[0] for e in ws.events] == ["anomaly_detected", "ui_render"]

    _anomaly_type, anomaly_payload = ws.events[0]
    assert anomaly_payload["cell_id"] == 2
    assert anomaly_payload["signal_def_id"] == 10
    assert anomaly_payload["value"] == 5.0
    assert anomaly_payload["threshold"] == 4.5
    assert anomaly_payload["severity"] == "alert"
    assert anomaly_payload["direction"] == "high"
    assert "work_order_id" in anomaly_payload
    assert "time" in anomaly_payload  # broadcast key is still "time", set to breach_start

    _ui_type, ui_payload = ws.events[1]
    assert ui_payload["agent"] == "sentinel"
    assert ui_payload["component"] == "alert_banner"
    assert ui_payload["props"]["severity"] == "alert"
    assert ui_payload["props"]["cell_id"] == 2
    assert ui_payload["props"]["anomaly_id"] == anomaly_payload["work_order_id"]
    assert "turn_id" in ui_payload


@pytest.mark.asyncio
async def test_double_sided_low_flow_breach_is_handled(patch_sentinel) -> None:
    """``flow_l_min`` low breach: severity=alert, direction=low."""
    breach = _breach(
        signal_def_id=20,
        display_name="Flow",
        kb_key="flow_l_min",
        value=8.0,
        threshold_value=10.0,
        severity="alert",
        direction="low",
        threshold_field="low_alert",
    )
    _mcp, ws, conn = patch_sentinel(
        cells=[{"cell_id": 2, "cell_name": "P-02", "onboarding_complete": True}],
        mcp_results={2: _ToolResult(content=json.dumps([breach]))},
    )

    await sentinel_mod._sentinel_tick()

    assert len(conn.created_wo) == 1
    anomaly_payload = ws.events[0][1]
    assert anomaly_payload["direction"] == "low"
    assert anomaly_payload["severity"] == "alert"


@pytest.mark.asyncio
async def test_debounce_skips_when_existing_open_wo(patch_sentinel) -> None:
    breach = _breach(signal_def_id=10)
    _mcp, ws, conn = patch_sentinel(
        cells=[{"cell_id": 2, "cell_name": "P-02", "onboarding_complete": True}],
        mcp_results={2: _ToolResult(content=json.dumps([breach]))},
        existing_wo=1,  # debounce probe returns a row -> skip
    )

    await sentinel_mod._sentinel_tick()

    assert conn.created_wo == []
    assert ws.events == []


@pytest.mark.asyncio
async def test_same_signal_within_tick_only_creates_one_wo(patch_sentinel) -> None:
    breach_a = _breach(signal_def_id=10, value=5.0)
    breach_b = _breach(signal_def_id=10, value=5.2)  # same signal, later reading
    _mcp, ws, conn = patch_sentinel(
        cells=[{"cell_id": 2, "cell_name": "P-02", "onboarding_complete": True}],
        mcp_results={2: _ToolResult(content=json.dumps([breach_a, breach_b]))},
    )

    await sentinel_mod._sentinel_tick()

    assert len(conn.created_wo) == 1
    # Only one anomaly_detected even though two breach rows came back.
    anomaly_events = [e for e in ws.events if e[0] == "anomaly_detected"]
    assert len(anomaly_events) == 1


@pytest.mark.asyncio
async def test_sentinel_loop_survives_tick_exception(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """A raising tick must not kill the loop."""
    call_count = 0

    async def boom() -> None:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("boom")
        # Second call: exit the loop by cancelling from within.
        raise asyncio.CancelledError()

    async def fast_sleep(_seconds: float) -> None:
        # Make the loop tight so the test finishes quickly.
        return None

    monkeypatch.setattr(sentinel_mod, "_sentinel_tick", boom)
    monkeypatch.setattr(sentinel_mod.asyncio, "sleep", fast_sleep)

    with caplog.at_level("ERROR"):
        with pytest.raises(asyncio.CancelledError):
            await sentinel_mod.sentinel_loop()

    assert call_count == 2  # first tick raised, second still ran
    assert any("Sentinel tick failed" in rec.message for rec in caplog.records)


@pytest.mark.asyncio
async def test_startup_log_fires_exactly_once(
    patch_sentinel, caplog: pytest.LogCaptureFixture
) -> None:
    patch_sentinel(
        cells=[
            {"cell_id": 1, "cell_name": "P-01", "onboarding_complete": False},
            {"cell_id": 2, "cell_name": "P-02", "onboarding_complete": True},
        ]
    )
    with caplog.at_level("INFO"):
        await sentinel_mod._sentinel_tick()
        caplog.clear()
        await sentinel_mod._sentinel_tick()

    # Second tick must NOT re-emit the watching/ignored summary.
    assert not any("Sentinel watching cells" in rec.message for rec in caplog.records)


def test_alert_banner_schema_is_imported() -> None:
    """Explicit reference so #24 intentionally depends on the #16 schema."""
    from agents.ui_tools import ALERT_BANNER_SCHEMA

    assert ALERT_BANNER_SCHEMA["name"] == "render_alert_banner"
    enum = ALERT_BANNER_SCHEMA["input_schema"]["properties"]["severity"]["enum"]
    # ``evaluate_threshold`` forwards verbatim — every value it produces must
    # be in the banner schema's enum.
    assert {"alert", "trip"} <= set(enum)


@pytest.mark.asyncio
async def test_investigator_lazy_import_missing_is_handled(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Without ``agents.investigator`` on the path (#25 not yet merged), the
    spawn helper must log an INFO line and return — not raise.
    """
    import sys

    # Ensure the lazy import raises ImportError deterministically.
    monkeypatch.setitem(sys.modules, "agents.investigator", None)

    with caplog.at_level("INFO"):
        sentinel_mod._spawn_investigator(work_order_id=42)

    assert any("Investigator not yet implemented" in rec.message for rec in caplog.records)
