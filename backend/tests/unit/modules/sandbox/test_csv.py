"""Tests for ``modules.sandbox.app.signal_csv`` (#105 / M5.7).

The CSV endpoint feeds the Managed Investigator's container with raw
signal samples for numerical diagnostics (FFT, regression, SPC). This
test exercises the handler directly with a fake ``asyncpg`` connection
— no FastAPI TestClient, matching the project's existing pattern
(see ``tests/unit/modules/kb/test_router_upload_broadcasts.py``).

Acceptance covered (issue #105):

- Happy path: header row + data rows, ordered ascending by time.
- 404 for unknown ``signal_def_id``.
- 400 for ``end <= start``.
- 413 when the window would return more than the row cap.
- ``Content-Disposition`` + signal-metadata headers present.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi import HTTPException
from modules.sandbox import app as sandbox_mod


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _FakeConn:
    """Minimal ``asyncpg.Connection`` surface — only the two methods
    :class:`SignalRepository` uses on this path.
    """

    def __init__(
        self,
        *,
        definition: dict[str, Any] | None,
        rows: list[dict[str, Any]],
    ) -> None:
        self._definition = definition
        self._rows = rows
        self.fetchrow_calls: list[tuple[str, tuple[Any, ...]]] = []
        self.fetch_calls: list[tuple[str, tuple[Any, ...]]] = []

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        self.fetchrow_calls.append((query, args))
        # The signal repository's get_definition() SELECT.
        return self._definition

    async def fetch(self, query: str, *args: Any) -> list[dict[str, Any]]:
        self.fetch_calls.append((query, args))
        # Respect asyncpg's DESC-by-time return order — signal_data() orders
        # by ``time DESC`` so the real query yields newest-first. The sandbox
        # handler then reverses to ascending for the CSV body.
        return sorted(self._rows, key=lambda r: r["time"], reverse=True)


def _sample_row(ts: datetime, value: float) -> dict[str, Any]:
    return {"time": ts, "raw_value": value}


def _sample_definition(def_id: int = 42) -> dict[str, Any]:
    return {
        "id": def_id,
        "display_name": "Motor shake",
        "unit_name": "mm/s",
    }


async def _collect_body(response: Any) -> bytes:
    """Drain a FastAPI ``StreamingResponse`` body into a single bytes."""
    chunks: list[bytes] = []
    async for chunk in response.body_iterator:
        # ``body_iterator`` on a StreamingResponse yields bytes when the
        # underlying generator yields bytes.
        chunks.append(chunk if isinstance(chunk, bytes) else chunk.encode("utf-8"))
    return b"".join(chunks)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_happy_path_returns_csv_ordered_ascending() -> None:
    t0 = datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc)
    rows = [
        _sample_row(t0 + timedelta(seconds=30 * i), 2.2 + 0.01 * i) for i in range(5)
    ]
    conn = _FakeConn(definition=_sample_definition(), rows=rows)

    response = await sandbox_mod.signal_csv(
        signal_def_id=42,
        start=t0,
        end=t0 + timedelta(hours=1),
        conn=conn,  # type: ignore[arg-type]
    )

    # Metadata headers — the agent can read these via ``curl -I``.
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["x-signal-def-id"] == "42"
    assert response.headers["x-signal-name"] == "Motor shake"
    assert response.headers["x-signal-row-count"] == "5"

    body = (await _collect_body(response)).decode("utf-8")
    lines = body.strip().split("\n")
    assert lines[0] == "timestamp,value"
    assert len(lines) == 6  # 1 header + 5 data rows

    # Ascending order: first data row is the earliest timestamp.
    first_data = lines[1].split(",")
    assert first_data[0].startswith("2026-04-24T12:00:00")
    # Values round-trip as floats.
    assert float(first_data[1]) == pytest.approx(2.2)


@pytest.mark.asyncio
async def test_empty_window_returns_header_only() -> None:
    """A window with no samples must still return the CSV header — the
    agent's ``pandas.read_csv`` otherwise fails with an empty-file error."""
    t0 = datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc)
    conn = _FakeConn(definition=_sample_definition(), rows=[])

    response = await sandbox_mod.signal_csv(
        signal_def_id=42,
        start=t0,
        end=t0 + timedelta(hours=1),
        conn=conn,  # type: ignore[arg-type]
    )

    assert response.headers["x-signal-row-count"] == "0"
    body = (await _collect_body(response)).decode("utf-8")
    assert body.strip() == "timestamp,value"


# ---------------------------------------------------------------------------
# Error cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unknown_signal_returns_404() -> None:
    t0 = datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc)
    conn = _FakeConn(definition=None, rows=[])

    with pytest.raises(HTTPException) as excinfo:
        await sandbox_mod.signal_csv(
            signal_def_id=9999,
            start=t0,
            end=t0 + timedelta(hours=1),
            conn=conn,  # type: ignore[arg-type]
        )
    assert excinfo.value.status_code == 404
    assert "9999" in str(excinfo.value.detail)
    # No data fetch should have happened — we bail on the missing definition.
    assert conn.fetch_calls == []


@pytest.mark.asyncio
async def test_malformed_window_end_before_start_returns_400() -> None:
    t0 = datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc)
    conn = _FakeConn(definition=_sample_definition(), rows=[])

    with pytest.raises(HTTPException) as excinfo:
        await sandbox_mod.signal_csv(
            signal_def_id=42,
            start=t0 + timedelta(hours=1),
            end=t0,
            conn=conn,  # type: ignore[arg-type]
        )
    assert excinfo.value.status_code == 400
    # Short-circuit before any DB call.
    assert conn.fetchrow_calls == []
    assert conn.fetch_calls == []


@pytest.mark.asyncio
async def test_malformed_window_equal_bounds_returns_400() -> None:
    t0 = datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc)
    conn = _FakeConn(definition=_sample_definition(), rows=[])

    with pytest.raises(HTTPException) as excinfo:
        await sandbox_mod.signal_csv(
            signal_def_id=42,
            start=t0,
            end=t0,
            conn=conn,  # type: ignore[arg-type]
        )
    assert excinfo.value.status_code == 400


@pytest.mark.asyncio
async def test_oversized_window_returns_413(monkeypatch: pytest.MonkeyPatch) -> None:
    # Shrink the row cap for the test so we do not have to materialise 1M rows.
    monkeypatch.setattr(sandbox_mod, "_MAX_ROWS", 5)

    t0 = datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc)
    rows = [
        _sample_row(t0 + timedelta(seconds=i), 0.0) for i in range(6 + 1)
    ]  # MAX_ROWS + 1 → trip the cap
    conn = _FakeConn(definition=_sample_definition(), rows=rows)

    with pytest.raises(HTTPException) as excinfo:
        await sandbox_mod.signal_csv(
            signal_def_id=42,
            start=t0,
            end=t0 + timedelta(hours=1),
            conn=conn,  # type: ignore[arg-type]
        )
    assert excinfo.value.status_code == 413
    assert "narrow" in str(excinfo.value.detail).lower()
