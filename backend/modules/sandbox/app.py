"""Sandbox sub-app — raw signal CSV for the Managed Investigator's container (#105 / M5.7).

The Managed Agents cloud container exposes ``bash`` to the Investigator.
For numerical diagnostics (FFT, rolling statistics, trend fits, cross-
correlations) the agent writes a Python heredoc, curls this endpoint for
the raw signal window as CSV, and pipes the result into ``numpy`` /
``pandas`` / ``scipy`` inside the container.

This sub-app is **not** part of the browser-facing ``/api/v1/*`` surface.
It is mounted in :mod:`main` at ``/sandbox/{ARIA_MCP_PATH_SECRET}`` —
identical pattern to ``/mcp/{secret}`` — so the mount path itself is the
auth: the container has no cookies, and Anthropic cannot forward custom
headers upstream to us. The secret rotates by remounting.

Contract (per issue #105):

- ``GET /signal/{signal_def_id}/csv?start=<iso>&end=<iso>`` — returns
  ``timestamp,value`` rows inclusive of ``start`` and exclusive of
  ``end``, ordered ascending by time. First row is the header.
- ``404`` if ``signal_def_id`` does not exist.
- ``400`` if the window is malformed (unparseable ISO, ``start >= end``).
- ``413`` if the window would return more rows than :data:`_MAX_ROWS`.

No LLM-facing logic lives here — this module is pure data transport.
"""

from __future__ import annotations

import csv
import io
import logging
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

import asyncpg
from core.database import db
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from modules.signal.repository import SignalRepository

log = logging.getLogger("aria.sandbox")

# Row cap for a single CSV fetch. 1_000_000 rows at 30 s sampling is
# ~347 days; more than any realistic diagnostic window. The cap guards
# against a malformed window that would pin the container for minutes
# transferring gigabytes, and protects the backend worker pool.
_MAX_ROWS = 1_000_000


sandbox_app = FastAPI(
    title="ARIA sandbox data",
    description=(
        "Path-secret-gated data endpoints consumed by the Managed Investigator's "
        "cloud container. Not a public API."
    ),
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


async def _acquire_sandbox_conn() -> AsyncIterator[asyncpg.Connection]:
    """Sandbox-scoped DB dependency.

    The stock ``core.database.get_db`` reads ``request.app.state.db``, which
    is only populated on the *parent* app's state by the lifespan handler.
    A mounted sub-app has its own empty ``.state``, so that helper raises
    ``AttributeError: 'State' object has no attribute 'db'`` when called
    under the sandbox mount. This dependency uses the module-level
    :data:`core.database.db` singleton directly — same pool, scoped to the
    sub-app's use case.
    """
    async with db.pool.acquire() as conn:
        yield conn


@sandbox_app.get("/signal/{signal_def_id}/csv", response_class=StreamingResponse)
async def signal_csv(
    signal_def_id: int,
    start: datetime = Query(..., description="ISO-8601 window start (inclusive)"),
    end: datetime = Query(..., description="ISO-8601 window end (exclusive)"),
    conn: asyncpg.Connection = Depends(_acquire_sandbox_conn),
) -> StreamingResponse:
    """Stream a signal window as ``timestamp,value`` CSV.

    The Investigator agent typically calls this with a heredoc bash script:

        curl -s ".../signal/42/csv?start=...&end=..." > /tmp/v.csv
        python - <<PY
        import pandas as pd
        df = pd.read_csv("/tmp/v.csv")
        ...
        PY
    """
    if end <= start:
        raise HTTPException(
            status_code=400,
            detail=f"end ({end.isoformat()}) must be strictly after start ({start.isoformat()})",
        )

    repo = SignalRepository(conn)

    definition = await repo.get_definition(signal_def_id)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"signal {signal_def_id} not found")

    # Fetch MAX+1 so a single comparison tells us if the window is oversized.
    # For the demo's typical 6 h window with 30 s sampling this is ~720 rows,
    # well under the cap.
    rows = await repo.signal_data(signal_def_id, start, end, _MAX_ROWS + 1)
    if len(rows) > _MAX_ROWS:
        raise HTTPException(
            status_code=413,
            detail=(
                f"window would return more than {_MAX_ROWS} rows; "
                "narrow the time range and retry"
            ),
        )

    # Repository orders DESC for the telemetry UI; the agent's math wants
    # time-ascending so we flip here in-place. Still cheap at <=1M rows.
    rows = list(reversed(rows))
    display_name = definition["display_name"] if definition is not None else None
    unit_name = definition.get("unit_name") if isinstance(definition, dict) else None

    stream = _rows_to_csv(rows)
    return StreamingResponse(
        stream,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="signal_{signal_def_id}.csv"',
            "X-Signal-Def-Id": str(signal_def_id),
            "X-Signal-Name": str(display_name or signal_def_id),
            "X-Signal-Unit": str(unit_name or ""),
            "X-Signal-Row-Count": str(len(rows)),
        },
    )


async def _rows_to_csv(rows: list[dict[str, Any]]) -> AsyncIterator[bytes]:
    """Yield the CSV body as UTF-8 chunks.

    Rows come from asyncpg as ``Record`` objects with ``time`` / ``raw_value``
    columns (see :meth:`modules.signal.repository.SignalRepository.signal_data`).
    """
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["timestamp", "value"])
    yield buf.getvalue().encode("utf-8")
    buf.seek(0)
    buf.truncate(0)

    # Batch yields to amortise the cost of the UTF-8 encode on very large
    # windows. 500 rows per chunk keeps working-set RAM tiny.
    _BATCH = 500
    for i in range(0, len(rows), _BATCH):
        chunk = rows[i : i + _BATCH]
        for row in chunk:
            writer.writerow([row["time"].isoformat(), row["raw_value"]])
        yield buf.getvalue().encode("utf-8")
        buf.seek(0)
        buf.truncate(0)
