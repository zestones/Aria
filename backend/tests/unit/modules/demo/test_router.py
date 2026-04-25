"""Tests for ``modules.demo.router`` (issue #29 / M4.7 memory flex scene).

Covers the handler's SQL orchestration without touching a live database:

- Returns 404 when the cell does not exist.
- Returns 400 when the cell has no vibration signal_def mapped to
  ``kb_threshold_key='vibration_mm_s'``.
- Happy path inside a transaction: DELETE recent failure_history, INSERT
  one past failure, CANCEL open agent WOs, INSERT the burst of fresh
  readings, returns the expected envelope.
"""

from __future__ import annotations

from typing import Any

import pytest
from modules.demo import router as demo_router

# ---------------------------------------------------------------------------
# Fake asyncpg.Connection surface — only the methods the handler uses.
# ---------------------------------------------------------------------------


class _FakeTxn:
    async def __aenter__(self) -> "_FakeTxn":
        return self

    async def __aexit__(self, *a: Any) -> None:
        return None


class _FakeConn:
    def __init__(
        self,
        *,
        cell_row: dict[str, Any] | None,
        sig_row: dict[str, Any] | None,
        past_id: int = 77,
    ) -> None:
        self._cell_row = cell_row
        self._sig_row = sig_row
        self._past_id = past_id
        self.fetchrow_calls: list[tuple[str, tuple[Any, ...]]] = []
        self.execute_calls: list[tuple[str, tuple[Any, ...]]] = []

    def transaction(self) -> _FakeTxn:
        return _FakeTxn()

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        self.fetchrow_calls.append((query, args))
        q = " ".join(query.split())
        if "FROM cell WHERE name" in q:
            return self._cell_row
        if "FROM process_signal_definition" in q:
            return self._sig_row
        if "INSERT INTO failure_history" in q:
            return {"id": self._past_id}
        return None

    async def execute(self, query: str, *args: Any) -> str:
        self.execute_calls.append((query, args))
        q = " ".join(query.split())
        if "DELETE FROM failure_history" in q:
            return "DELETE 0"
        if "UPDATE work_order" in q:
            return "UPDATE 1"
        if "INSERT INTO process_signal_data" in q:
            return "INSERT 0 1"
        if "DELETE FROM process_signal_data" in q:
            return "DELETE 0"
        return "OK"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_returns_404_when_cell_missing() -> None:
    conn = _FakeConn(cell_row=None, sig_row=None)
    with pytest.raises(Exception) as excinfo:
        await demo_router.trigger_memory_scene(
            cell_name="UNKNOWN-99", conn=conn  # type: ignore[arg-type]
        )
    # FastAPI HTTPException — inspect via attribute.
    assert getattr(excinfo.value, "status_code", None) == 404


@pytest.mark.asyncio
async def test_returns_400_when_signal_def_missing() -> None:
    conn = _FakeConn(cell_row={"id": 2}, sig_row=None)
    with pytest.raises(Exception) as excinfo:
        await demo_router.trigger_memory_scene(
            cell_name="Bottle Filler", conn=conn  # type: ignore[arg-type]
        )
    assert getattr(excinfo.value, "status_code", None) == 400
    # Nothing written when signal lookup fails (we return before the txn).
    assert conn.execute_calls == []


@pytest.mark.asyncio
async def test_happy_path_orchestrates_all_four_steps() -> None:
    conn = _FakeConn(cell_row={"id": 2}, sig_row={"id": 55}, past_id=99)

    resp = await demo_router.trigger_memory_scene(
        cell_name="Bottle Filler", conn=conn  # type: ignore[arg-type]
    )

    assert resp["ok"] is True
    assert resp["cell_id"] == 2
    assert resp["cell_name"] == "Bottle Filler"
    assert resp["past_failure_id"] == 99
    assert resp["signal_def_id"] == 55
    # 5 readings seeded by the handler.
    assert resp["readings_inserted"] == 5
    assert resp["expect_anomaly_within_seconds"] == 35

    # Step order inside the txn: DELETE, (fetchrow INSERT failure), UPDATE,
    # then 5 x INSERT process_signal_data.
    exec_queries = [" ".join(q.split()) for q, _ in conn.execute_calls]
    assert any(q.startswith("DELETE FROM failure_history") for q in exec_queries)
    assert any(q.startswith("UPDATE work_order") for q in exec_queries)
    readings_inserts = [q for q in exec_queries if "INSERT INTO process_signal_data" in q]
    assert len(readings_inserts) == 5


@pytest.mark.asyncio
async def test_happy_path_past_failure_row_carries_signal_patterns_jsonb() -> None:
    conn = _FakeConn(cell_row={"id": 2}, sig_row={"id": 55})

    await demo_router.trigger_memory_scene(cell_name="Bottle Filler", conn=conn)  # type: ignore[arg-type]

    insert_calls = [
        (q, args)
        for q, args in conn.fetchrow_calls
        if "INSERT INTO failure_history" in " ".join(q.split())
    ]
    assert len(insert_calls) == 1
    _, args = insert_calls[0]
    # args[0] = cell_id, args[1] = jsonb string
    assert args[0] == 2
    import json as _json

    patterns = _json.loads(args[1])
    assert "vibration_mm_s" in patterns
    assert patterns["vibration_mm_s"]["peak"] == pytest.approx(5.4)


@pytest.mark.asyncio
async def test_readings_all_above_alert_threshold() -> None:
    conn = _FakeConn(cell_row={"id": 2}, sig_row={"id": 55})
    await demo_router.trigger_memory_scene(cell_name="Bottle Filler", conn=conn)  # type: ignore[arg-type]
    # All seeded readings must exceed the vibration alert (4.5 mm/s)
    # otherwise Sentinel will not open a work_order and the scene dies.
    reading_values = [
        args[-1]
        for q, args in conn.execute_calls
        if "INSERT INTO process_signal_data" in " ".join(q.split())
    ]
    assert reading_values  # at least one
    assert all(v > 4.5 for v in reading_values)


# ---------------------------------------------------------------------------
# M9.4 — scene-orchestration endpoints (#54)
#
# These tests exercise the four new ``_do_*`` helpers directly with a
# fake asyncpg conn, mirroring the memory-scene test pattern above. The
# route wrappers are trivial passthroughs and are covered via the
# helper-level assertions.
# ---------------------------------------------------------------------------


class _M94FakeConn:
    """Extended fake conn that covers the additional query paths exercised
    by ``reset/light``, ``seed-forecast``, and ``trigger-breach``:

    - ``fetchrow(SELECT ... equipment_kb ...)`` for the KB threshold lookup
    - ``execute(DELETE FROM process_signal_data ...)`` for the light reset
      and for the seed-forecast window wipe

    The memory-scene test's ``_FakeConn`` doesn't cover these so we add a
    sibling that does.
    """

    def __init__(
        self,
        *,
        cell_row: dict[str, Any] | None,
        sig_row: dict[str, Any] | None,
        kb_row: dict[str, Any] | None = None,
    ) -> None:
        self._cell_row = cell_row
        self._sig_row = sig_row
        self._kb_row = kb_row
        self.fetchrow_calls: list[tuple[str, tuple[Any, ...]]] = []
        self.execute_calls: list[tuple[str, tuple[Any, ...]]] = []

    def transaction(self) -> _FakeTxn:
        return _FakeTxn()

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        self.fetchrow_calls.append((query, args))
        q = " ".join(query.split())
        if "FROM cell WHERE name" in q:
            return self._cell_row
        if "FROM process_signal_definition" in q:
            return self._sig_row
        if "FROM equipment_kb" in q:
            return self._kb_row
        return None

    async def execute(self, query: str, *args: Any) -> str:
        self.execute_calls.append((query, args))
        q = " ".join(query.split())
        if "UPDATE work_order" in q:
            # Deterministic tag so tests can assert the parsed int.
            return "UPDATE 2"
        if "DELETE FROM process_signal_data" in q:
            return "DELETE 7"
        if "INSERT INTO process_signal_data" in q:
            return "INSERT 0 1"
        return "OK"


@pytest.fixture(autouse=True)
def _reset_forecast_debounce() -> None:
    """Clear the module-level forecast-watch debounce between tests so a
    prior test run cannot leak state into the next one's count."""
    from agents.sentinel import forecast as forecast_mod

    forecast_mod._forecast_last_emit.clear()


# ---- reset/light ----------------------------------------------------------


@pytest.mark.asyncio
async def test_reset_light_cancels_wo_purges_readings_clears_debounce() -> None:
    """Light reset must hit all three surfaces and return the counts."""
    from agents.sentinel import forecast as forecast_mod
    from modules.demo.router import _do_reset_light

    # Seed the debounce table with two fake entries — the reset must empty it.
    forecast_mod._forecast_last_emit[(1, 1)] = 123.0
    forecast_mod._forecast_last_emit[(1, 2)] = 456.0

    conn = _M94FakeConn(cell_row=None, sig_row=None)
    resp = await _do_reset_light(conn)  # type: ignore[arg-type]

    # Fake conn returns "UPDATE 2" and "DELETE 7".
    assert resp["ok"] is True
    assert resp["cancelled_work_orders"] == 2
    assert resp["cleared_readings"] == 7
    assert resp["cleared_forecast_debounce_entries"] == 2
    assert forecast_mod._forecast_last_emit == {}

    exec_queries = [" ".join(q.split()) for q, _ in conn.execute_calls]
    # Exactly one UPDATE work_order + one DELETE FROM process_signal_data.
    assert sum(1 for q in exec_queries if q.startswith("UPDATE work_order")) == 1
    assert sum(1 for q in exec_queries if "DELETE FROM process_signal_data" in q) == 1


# ---- seed-forecast --------------------------------------------------------


@pytest.mark.asyncio
async def test_seed_forecast_404_when_cell_missing() -> None:
    from modules.demo.router import _do_seed_forecast

    conn = _M94FakeConn(cell_row=None, sig_row=None)
    with pytest.raises(Exception) as excinfo:
        await _do_seed_forecast(conn, "no-such-cell")  # type: ignore[arg-type]
    assert getattr(excinfo.value, "status_code", None) == 404


@pytest.mark.asyncio
async def test_seed_forecast_400_when_no_vibration_signal() -> None:
    from modules.demo.router import _do_seed_forecast

    conn = _M94FakeConn(cell_row={"id": 7}, sig_row=None)
    with pytest.raises(Exception) as excinfo:
        await _do_seed_forecast(conn, "Bottle Filler")  # type: ignore[arg-type]
    assert getattr(excinfo.value, "status_code", None) == 400


@pytest.mark.asyncio
async def test_seed_forecast_happy_path_writes_40_ramped_samples() -> None:
    """Should insert exactly 40 rows with monotonically increasing values
    spanning roughly the alert*0.60 → alert*0.92 range."""
    from modules.demo.router import (
        _SEED_FORECAST_SAMPLE_COUNT,
        _do_seed_forecast,
    )

    kb_row = {
        "structured_data": {"thresholds": {"vibration_mm_s": {"alert": 5.0}}},
    }
    conn = _M94FakeConn(cell_row={"id": 7}, sig_row={"id": 42}, kb_row=kb_row)
    resp = await _do_seed_forecast(conn, "Bottle Filler")  # type: ignore[arg-type]

    assert resp["ok"] is True
    assert resp["cell_id"] == 7
    assert resp["signal_def_id"] == 42
    assert resp["samples_inserted"] == _SEED_FORECAST_SAMPLE_COUNT
    # Ramp spans alert_threshold * 0.60 → alert_threshold * 0.92.
    assert resp["drift_start_value"] == pytest.approx(5.0 * 0.60, rel=1e-3)
    assert resp["drift_end_value"] == pytest.approx(5.0 * 0.92, rel=1e-3)
    assert resp["alert_threshold"] == pytest.approx(5.0)
    assert resp["expected_forecast_within_seconds"] == 60

    inserts = [
        (q, args)
        for q, args in conn.execute_calls
        if "INSERT INTO process_signal_data" in " ".join(q.split())
    ]
    assert len(inserts) == _SEED_FORECAST_SAMPLE_COUNT
    # Values in insertion order must be monotonically increasing.
    values = [args[-1] for _, args in inserts]
    assert values == sorted(values)
    # First value strictly < last value (non-degenerate ramp).
    assert values[0] < values[-1]


@pytest.mark.asyncio
async def test_seed_forecast_falls_back_to_iso_threshold_when_kb_missing() -> None:
    """KB has no thresholds entry → endpoint must still run at ISO 4.5."""
    from modules.demo.router import _FALLBACK_VIBRATION_ALERT_MM_S, _do_seed_forecast

    conn = _M94FakeConn(cell_row={"id": 7}, sig_row={"id": 42}, kb_row=None)
    resp = await _do_seed_forecast(conn, "Bottle Filler")  # type: ignore[arg-type]

    assert resp["alert_threshold"] == pytest.approx(_FALLBACK_VIBRATION_ALERT_MM_S)


# ---- trigger-breach --------------------------------------------------------


@pytest.mark.asyncio
async def test_trigger_breach_404_when_cell_missing() -> None:
    from modules.demo.router import _do_trigger_breach

    conn = _M94FakeConn(cell_row=None, sig_row=None)
    with pytest.raises(Exception) as excinfo:
        await _do_trigger_breach(conn, "no-such-cell")  # type: ignore[arg-type]
    assert getattr(excinfo.value, "status_code", None) == 404


@pytest.mark.asyncio
async def test_trigger_breach_inserts_5_readings_above_alert() -> None:
    from modules.demo.router import (
        _TRIGGER_BREACH_COUNT,
        _do_trigger_breach,
    )

    kb_row = {"structured_data": {"thresholds": {"vibration_mm_s": {"alert": 4.5}}}}
    conn = _M94FakeConn(cell_row={"id": 2}, sig_row={"id": 10}, kb_row=kb_row)
    resp = await _do_trigger_breach(conn, "Bottle Filler")  # type: ignore[arg-type]

    assert resp["ok"] is True
    assert resp["readings_inserted"] == _TRIGGER_BREACH_COUNT
    assert resp["alert_threshold"] == pytest.approx(4.5)

    inserts = [
        args[-1]
        for q, args in conn.execute_calls
        if "INSERT INTO process_signal_data" in " ".join(q.split())
    ]
    assert len(inserts) == _TRIGGER_BREACH_COUNT
    # Every injected value must be strictly above the alert threshold,
    # otherwise Sentinel will not classify it as a breach.
    assert all(v > 4.5 for v in inserts)


@pytest.mark.asyncio
async def test_trigger_breach_cancels_open_agent_wos_on_same_signal() -> None:
    """The pre-insert UPDATE must target the (cell, signal) pair — not the
    whole cell — so unrelated open WOs are not swept up."""
    from modules.demo.router import _do_trigger_breach

    conn = _M94FakeConn(cell_row={"id": 2}, sig_row={"id": 10}, kb_row={"structured_data": {}})
    await _do_trigger_breach(conn, "Bottle Filler")  # type: ignore[arg-type]

    updates = [
        (q, args) for q, args in conn.execute_calls if "UPDATE work_order" in " ".join(q.split())
    ]
    assert len(updates) == 1
    _, args = updates[0]
    # (cell_id=2, signal_def_id=10) must be the parameters of the UPDATE.
    assert args[0] == 2
    assert args[1] == 10
