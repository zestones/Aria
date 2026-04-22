"""KbRepository.upsert validation guard (issue #69).

Ensures that an upsert dropping a key referenced by
``process_signal_definition.kb_threshold_key`` raises ``ValidationFailedError``
without touching the database (the guard short-circuits before INSERT).
"""

from __future__ import annotations

import pytest
from core.exceptions import ValidationFailedError
from modules.kb.repository import KbRepository


class _FakeRow(dict):
    def __getitem__(self, key):
        return super().__getitem__(key)


class _FakeConn:
    """Minimal asyncpg-shaped stub. Only ``fetch`` is exercised by the guard."""

    def __init__(self, kb_threshold_keys: list[str]) -> None:
        self._keys = kb_threshold_keys
        self.executed: list[str] = []

    async def fetch(self, query: str, *args):
        if "kb_threshold_key" in query:
            return [_FakeRow({"kb_threshold_key": k}) for k in self._keys]
        return []

    async def execute(self, query: str, *args):
        self.executed.append(query)

    async def fetchrow(self, query: str, *args):  # pragma: no cover — never reached
        return None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_upsert_rejects_payload_that_orphans_referenced_keys():
    conn = _FakeConn(["vibration_mm_s", "bearing_temp_c", "flow_l_min", "pressure_bar"])
    repo = KbRepository(conn)  # type: ignore[arg-type]
    payload = {
        "cell_id": 1,
        "structured_data": {"thresholds": {"flow_m3h": {"nominal": 32, "alert": 40}}},
    }
    with pytest.raises(ValidationFailedError) as exc_info:
        await repo.upsert(payload)
    msg = str(exc_info.value)
    assert "vibration_mm_s" in msg
    assert "pressure_bar" in msg
    assert "kb_threshold_key" in msg
    assert conn.executed == [], "INSERT must not run when guard fires"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_upsert_accepts_payload_with_all_required_keys():
    conn = _FakeConn(["vibration_mm_s"])
    repo = KbRepository(conn)  # type: ignore[arg-type]
    payload = {
        "cell_id": 1,
        "structured_data": {
            "thresholds": {
                "vibration_mm_s": {"nominal": 2.2, "alert": 4.5, "trip": 7.1},
                "extra_key": {"alert": 1.0},
            }
        },
    }
    # Should not raise; will then invoke execute() (then fetchrow returns None — fine).
    await repo.upsert(payload)
    assert len(conn.executed) == 1
    assert conn.executed[0].startswith("INSERT INTO equipment_kb")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_upsert_skips_validation_when_structured_data_absent():
    conn = _FakeConn(["vibration_mm_s"])
    repo = KbRepository(conn)  # type: ignore[arg-type]
    # Partial update — no structured_data field — must not be blocked.
    await repo.upsert({"cell_id": 1, "manufacturer": "FlowTech"})
    assert len(conn.executed) == 1


@pytest.mark.unit
@pytest.mark.asyncio
async def test_upsert_allows_any_payload_when_no_signals_carry_kb_keys():
    conn = _FakeConn([])  # no signal_def has kb_threshold_key set
    repo = KbRepository(conn)  # type: ignore[arg-type]
    await repo.upsert(
        {
            "cell_id": 99,
            "structured_data": {"thresholds": {"random_key": {"alert": 1}}},
        }
    )
    assert len(conn.executed) == 1
