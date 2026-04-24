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

# Sentinel is now a package; the two loops live in sibling submodules and the
# tests patch at the site-of-use rather than the package __init__ (monkeypatch
# on the __init__ would leave the submodule's own ``db`` / ``ws_manager``
# bindings untouched — a real foot-gun worth avoiding).
from agents.sentinel import forecast as forecast_mod
from agents.sentinel import service as sentinel_mod

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
    # Exactly three broadcasts, in order: anomaly_detected, ui_render,
    # agent_handoff (Sentinel → Investigator visibility frame).
    assert [e[0] for e in ws.events] == ["anomaly_detected", "ui_render", "agent_handoff"]

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
async def test_spawn_investigator_creates_background_task(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Spawn helper must fire-and-forget the Investigator via ``create_task``.

    Replaces the pre-M5 ``test_investigator_lazy_import_missing_is_handled``
    which covered a defensive ``ImportError`` branch that was removed in
    commit ``3b541b5`` (``refactor(sentinel): remove redundant import
    handling for run_investigator``). The new contract is: given a valid
    ``work_order_id``, ``_spawn_investigator`` schedules the coroutine on
    the running loop with a deterministic task name and returns
    synchronously without awaiting it.
    """

    spawned: list[int] = []

    async def fake_run_investigator(work_order_id: int) -> None:
        spawned.append(work_order_id)

    monkeypatch.setattr(sentinel_mod, "run_investigator", fake_run_investigator)

    sentinel_mod._spawn_investigator(work_order_id=42)

    # Find our freshly-scheduled task by name and await it so the test does
    # not leak a pending task into the loop's teardown.
    tasks = [t for t in asyncio.all_tasks() if t.get_name() == "investigator-wo-42"]
    assert len(tasks) == 1
    await tasks[0]
    assert spawned == [42]


# ---------------------------------------------------------------------------
# Regression — FastMCP auto-wraps non-Pydantic returns as
# ``{"result": [...]}``. Sentinel's call_tool payload for
# ``get_signal_anomalies`` is ``list[dict]``, so the structured_content path
# in ``aria_mcp.client`` hands back a dict, not a list. Without the unwrap
# guard, ``for breach in breaches`` iterates dict keys and the tick crashes.
# (audit #3 / post-M7.4 bundle)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fastmcp_wrapped_breaches_are_unwrapped(patch_sentinel) -> None:
    """``{"result": [breach, ...]}`` must be handled like ``[breach, ...]``."""
    breach = _breach(signal_def_id=10, value=5.0, threshold_value=4.5)
    wrapped_payload = json.dumps({"result": [breach]})
    _mcp, ws, conn = patch_sentinel(
        cells=[{"cell_id": 2, "cell_name": "P-02", "onboarding_complete": True}],
        mcp_results={2: _ToolResult(content=wrapped_payload)},
    )

    await sentinel_mod._sentinel_tick()

    # Unwrap must succeed: exactly one WO created, ``anomaly_detected`` frame
    # carries the row payload — not the dict keys of the wrapper.
    assert len(conn.created_wo) == 1
    anomaly_events = [e for e in ws.events if e[0] == "anomaly_detected"]
    assert len(anomaly_events) == 1
    assert anomaly_events[0][1]["signal_def_id"] == 10
    assert anomaly_events[0][1]["value"] == 5.0


# ---------------------------------------------------------------------------
# Forecast-watch (M9 predictive-alerting loop)
#
# These tests exercise :func:`sentinel._forecast_watch_tick` with fake DB rows
# in the same style as the Sentinel tests above. They cover:
#  - Unit math of ``_ordinary_least_squares`` on clean rising series.
#  - ``_pick_first_breach`` picks the smallest positive ETA among reachable
#    thresholds and rejects thresholds the series is drifting away from.
#  - ``_parse_thresholds`` handles the three input shapes we see in the KB
#    (dict / JSON string / None).
#  - End-to-end: a rising series under a forecast tick emits one
#    ``forecast_warning`` with the expected fields; a flat / noisy / too-short
#    series emits nothing.
#  - Debounce: emitting twice within the debounce window is suppressed.
# ---------------------------------------------------------------------------


def _make_rising_series(
    *,
    count: int = 60,
    slope_per_hour: float = 1.0,
    start_value: float = 10.0,
    window_minutes: int = 6 * 60,
) -> list[dict[str, Any]]:
    """Return ``count`` samples rising linearly at ``slope_per_hour`` units/h.

    The sample timestamps are evenly spread over ``window_minutes`` so the
    regression has a realistic spread of x-values.
    """
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    start = now - timedelta(minutes=window_minutes)
    step_hours = window_minutes / 60.0 / max(1, count - 1)
    samples = []
    for i in range(count):
        t = start + timedelta(hours=step_hours * i)
        value = start_value + slope_per_hour * (step_hours * i)
        samples.append({"time": t, "raw_value": value})
    return samples


def test_ols_recovers_clean_slope() -> None:
    """Clean rising series → slope matches generator, r² ≈ 1.0."""
    samples = _make_rising_series(count=60, slope_per_hour=2.0, start_value=10.0)
    result = forecast_mod._ordinary_least_squares(samples)
    assert result is not None
    slope, _intercept, r_squared, _last_x, last_value = result
    assert abs(slope - 2.0) < 1e-6
    assert r_squared > 0.999
    assert abs(last_value - samples[-1]["raw_value"]) < 1e-9


def test_ols_rejects_constant_series() -> None:
    """All-constant series → no drift to regress; helper returns None."""
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    samples = [{"time": now - timedelta(minutes=i), "raw_value": 7.0} for i in range(30)]
    assert forecast_mod._ordinary_least_squares(samples) is None


def test_pick_first_breach_returns_nearest_reachable() -> None:
    """With two reachable thresholds, pick the one crossed first."""
    # Value at 10, slope +1/h → alert=15 reached in 5h, trip=25 reached in 15h.
    pick = forecast_mod._pick_first_breach(
        thresholds={"alert": 15.0, "trip": 25.0},
        last_value=10.0,
        slope=1.0,
        horizon_hours=20.0,
    )
    assert pick is not None
    threshold_value, threshold_field, eta = pick
    assert threshold_value == 15.0
    assert threshold_field == "alert"
    assert abs(eta - 5.0) < 1e-9


def test_pick_first_breach_rejects_drift_away() -> None:
    """Rising slope, threshold below current → unreachable."""
    pick = forecast_mod._pick_first_breach(
        thresholds={"low_alert": 5.0},
        last_value=10.0,
        slope=1.0,
        horizon_hours=20.0,
    )
    assert pick is None


def test_pick_first_breach_rejects_beyond_horizon() -> None:
    """Reachable threshold but ETA past the horizon window → no forecast."""
    pick = forecast_mod._pick_first_breach(
        thresholds={"alert": 100.0},
        last_value=10.0,
        slope=1.0,
        horizon_hours=12.0,
    )
    assert pick is None  # 90 h / 1 h = 90 h > 12 h horizon


def test_parse_thresholds_accepts_dict_and_json_and_none() -> None:
    assert forecast_mod._parse_thresholds({"alert": 1.0, "trip": 2.0, "note": "x"}) == {
        "alert": 1.0,
        "trip": 2.0,
    }
    assert forecast_mod._parse_thresholds('{"alert": 3.5}') == {"alert": 3.5}
    assert forecast_mod._parse_thresholds(None) == {}
    # Booleans are numbers in Python but meaningless as thresholds — skipped.
    assert forecast_mod._parse_thresholds({"alert": True}) == {}


# -- End-to-end forecast tick -------------------------------------------------


class _ForecastFakeConn:
    """Fake asyncpg connection for ``_forecast_watch_tick`` + friends.

    Two fetch paths:
      - SELECT ... FROM process_signal_definition JOIN equipment_kb ... → rows
      - SELECT time, raw_value FROM process_signal_data → samples
    """

    def __init__(
        self,
        *,
        signals: list[dict[str, Any]],
        samples_by_signal: dict[int, list[dict[str, Any]]],
    ) -> None:
        self._signals = signals
        self._samples = samples_by_signal

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        if "FROM process_signal_definition" in query:
            return list(self._signals)
        if "FROM process_signal_data" in query:
            signal_def_id = args[0]
            return list(self._samples.get(signal_def_id, []))
        return []


@dataclass
class _ForecastFakePool:
    conn: _ForecastFakeConn

    def acquire(self) -> "_ForecastFakeCtx":
        return _ForecastFakeCtx(self.conn)


@dataclass
class _ForecastFakeCtx:
    conn: _ForecastFakeConn

    async def __aenter__(self) -> _ForecastFakeConn:
        return self.conn

    async def __aexit__(self, *a: Any) -> None:
        return None


@dataclass
class _ForecastFakeDB:
    pool: _ForecastFakePool


@pytest.fixture
def patch_forecast(monkeypatch: pytest.MonkeyPatch):
    """Inject a fake DB and WS into ``sentinel`` for forecast-watch tests.

    Also clears the module-level debounce dict so each test starts fresh.
    """

    def _install(
        *,
        signals: list[dict[str, Any]],
        samples_by_signal: dict[int, list[dict[str, Any]]],
    ) -> tuple[_FakeWS, _ForecastFakeConn]:
        conn = _ForecastFakeConn(signals=signals, samples_by_signal=samples_by_signal)
        db_fake = _ForecastFakeDB(pool=_ForecastFakePool(conn))
        ws = _FakeWS()
        # Patch the forecast submodule's bindings at the site-of-use.
        monkeypatch.setattr(forecast_mod, "db", db_fake)
        monkeypatch.setattr(forecast_mod, "ws_manager", ws)
        forecast_mod._forecast_last_emit.clear()
        return ws, conn

    return _install


@pytest.mark.asyncio
async def test_forecast_tick_emits_warning_on_rising_drift(patch_forecast) -> None:
    """Rising signal heading toward its alert threshold → one forecast_warning."""
    # Vibration rising at 0.5 units/h; current ~13; alert=15 → ETA ~4h.
    samples = _make_rising_series(
        count=80, slope_per_hour=0.5, start_value=10.0, window_minutes=6 * 60
    )
    signals = [
        {
            "signal_def_id": 10,
            "cell_id": 2,
            "display_name": "Vibration",
            "kb_threshold_key": "vibration_mm_s",
            "cell_name": "P-02",
            "thresholds_json": {"alert": 15.0, "trip": 25.0},
        }
    ]
    ws, _conn = patch_forecast(signals=signals, samples_by_signal={10: samples})

    await forecast_mod._forecast_watch_tick()

    forecast_events = [e for e in ws.events if e[0] == "forecast_warning"]
    assert len(forecast_events) == 1
    _, payload = forecast_events[0]
    assert payload["cell_id"] == 2
    assert payload["signal_def_id"] == 10
    assert payload["signal_name"] == "Vibration"
    assert payload["threshold_value"] == 15.0
    assert payload["threshold_field"] == "alert"
    assert payload["trend"] == "rising"
    # ETA should be in a sensible band: ~4h, never > horizon.
    assert 1.0 < payload["eta_hours"] < 12.0
    assert payload["confidence"] > 0.35
    assert "projected_breach_at" in payload
    assert payload["severity"] in {"alert", "trip"}


@pytest.mark.asyncio
async def test_forecast_tick_skips_when_too_few_samples(patch_forecast) -> None:
    """A signal with < _FORECAST_MIN_SAMPLES rows emits nothing."""
    short = _make_rising_series(count=5, slope_per_hour=1.0, start_value=10.0)
    signals = [
        {
            "signal_def_id": 10,
            "cell_id": 2,
            "display_name": "Vibration",
            "kb_threshold_key": "vibration_mm_s",
            "cell_name": "P-02",
            "thresholds_json": {"alert": 15.0},
        }
    ]
    ws, _conn = patch_forecast(signals=signals, samples_by_signal={10: short})

    await forecast_mod._forecast_watch_tick()
    assert [e for e in ws.events if e[0] == "forecast_warning"] == []


@pytest.mark.asyncio
async def test_forecast_tick_skips_flat_series(patch_forecast) -> None:
    """A constant series has no drift → no forecast, no crash."""
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    flat = [{"time": now - timedelta(minutes=i), "raw_value": 10.0} for i in range(60, 0, -1)]
    signals = [
        {
            "signal_def_id": 10,
            "cell_id": 2,
            "display_name": "Vibration",
            "kb_threshold_key": "vibration_mm_s",
            "cell_name": "P-02",
            "thresholds_json": {"alert": 15.0},
        }
    ]
    ws, _conn = patch_forecast(signals=signals, samples_by_signal={10: flat})

    await forecast_mod._forecast_watch_tick()
    assert [e for e in ws.events if e[0] == "forecast_warning"] == []


@pytest.mark.asyncio
async def test_forecast_tick_skips_when_threshold_unreachable(patch_forecast) -> None:
    """Rising series, but alert threshold is below current value → skip."""
    samples = _make_rising_series(count=60, slope_per_hour=0.5, start_value=30.0)
    signals = [
        {
            "signal_def_id": 10,
            "cell_id": 2,
            "display_name": "Vibration",
            "kb_threshold_key": "vibration_mm_s",
            "cell_name": "P-02",
            # Only a low_alert — the rising series is drifting AWAY from it.
            "thresholds_json": {"low_alert": 5.0},
        }
    ]
    ws, _conn = patch_forecast(signals=signals, samples_by_signal={10: samples})

    await forecast_mod._forecast_watch_tick()
    assert [e for e in ws.events if e[0] == "forecast_warning"] == []


@pytest.mark.asyncio
async def test_forecast_tick_debounces_second_emission(patch_forecast) -> None:
    """Two back-to-back ticks emit only one forecast_warning per signal."""
    samples = _make_rising_series(count=80, slope_per_hour=0.5, start_value=10.0)
    signals = [
        {
            "signal_def_id": 10,
            "cell_id": 2,
            "display_name": "Vibration",
            "kb_threshold_key": "vibration_mm_s",
            "cell_name": "P-02",
            "thresholds_json": {"alert": 15.0},
        }
    ]
    ws, _conn = patch_forecast(signals=signals, samples_by_signal={10: samples})

    await forecast_mod._forecast_watch_tick()
    await forecast_mod._forecast_watch_tick()

    forecast_events = [e for e in ws.events if e[0] == "forecast_warning"]
    assert len(forecast_events) == 1
