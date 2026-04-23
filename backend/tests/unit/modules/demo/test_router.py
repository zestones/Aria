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
            cell_name="P-02", conn=conn  # type: ignore[arg-type]
        )
    assert getattr(excinfo.value, "status_code", None) == 400
    # Nothing written when signal lookup fails (we return before the txn).
    assert conn.execute_calls == []


@pytest.mark.asyncio
async def test_happy_path_orchestrates_all_four_steps() -> None:
    conn = _FakeConn(cell_row={"id": 2}, sig_row={"id": 55}, past_id=99)

    resp = await demo_router.trigger_memory_scene(
        cell_name="P-02", conn=conn  # type: ignore[arg-type]
    )

    assert resp["ok"] is True
    assert resp["cell_id"] == 2
    assert resp["cell_name"] == "P-02"
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

    await demo_router.trigger_memory_scene(
        cell_name="P-02", conn=conn  # type: ignore[arg-type]
    )

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
    await demo_router.trigger_memory_scene(
        cell_name="P-02", conn=conn  # type: ignore[arg-type]
    )
    # All seeded readings must exceed the P-02 vibration alert (4.5 mm/s)
    # otherwise Sentinel will not open a work_order and the scene dies.
    reading_values = [
        args[-1]
        for q, args in conn.execute_calls
        if "INSERT INTO process_signal_data" in " ".join(q.split())
    ]
    assert reading_values  # at least one
    assert all(v > 4.5 for v in reading_values)
