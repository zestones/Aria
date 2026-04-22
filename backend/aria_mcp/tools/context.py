"""Human-context tools (M2.4) — logbook, shift assignments, work orders.

Thin wrappers over existing repositories so the Investigator (M4.3) and Q&A
(M5.x) agents can pull operator notes, shift coverage, and intervention
history alongside the signal/KPI tools.
"""

from __future__ import annotations

from datetime import date

from aria_mcp._common import with_conn
from aria_mcp.server import mcp
from core.datetime_helpers import parse_tz_aware
from modules.logbook.repository import LogbookRepository
from modules.logbook.schemas import LogbookEntryOut
from modules.shift.repository import ShiftRepository
from modules.shift.schemas import ShiftAssignmentOut
from modules.work_order.repository import WorkOrderRepository
from modules.work_order.schemas import WorkOrderOut

# Default cap on rows for list-style tools — keeps token budget bounded
# when an over-eager agent forgets to narrow the window.
_DEFAULT_LIMIT = 200


def _parse_iso_date(s: str) -> date:
    """Parse a ``YYYY-MM-DD`` date string. Raises ``ValueError`` on bad input."""
    return date.fromisoformat(s.strip())


@mcp.tool()
async def get_logbook_entries(
    cell_id: int,
    window_start: str,
    window_end: str,
    category: str | None = None,
    severity: str | None = None,
    limit: int = _DEFAULT_LIMIT,
) -> list[dict]:
    """Operator logbook entries for a cell within a time window.

    Args:
        cell_id: Target cell.
        window_start: ISO-8601 with TZ offset (inclusive).
        window_end: ISO-8601 with TZ offset (exclusive).
        category: Optional filter — ``observation``, ``maintenance``, ``incident``,
            ``changeover``, ``note``.
        severity: Optional filter — ``info``, ``warning``, ``critical``.
        limit: Max rows returned (default 200).

    Returns:
        List of ``LogbookEntryOut`` dicts ordered by ``entry_time DESC``.
    """
    ws = parse_tz_aware(window_start)
    we = parse_tz_aware(window_end)
    async with with_conn() as conn:
        rows = await LogbookRepository(conn).list(
            cell_id=cell_id,
            category=category,
            severity=severity,
            window_start=ws,
            window_end=we,
            limit=limit,
        )
    return [LogbookEntryOut.model_validate(dict(r)).model_dump(mode="json") for r in rows]


@mcp.tool()
async def get_shift_assignments(
    cell_id: int,
    date_start: str,
    date_end: str,
) -> list[dict]:
    """Shift assignments covering a cell over a date range.

    Args:
        cell_id: Target cell.
        date_start: ``YYYY-MM-DD`` (inclusive).
        date_end: ``YYYY-MM-DD`` (inclusive — assignments are day-granular).

    Returns:
        List of ``ShiftAssignmentOut`` dicts ordered by ``assigned_date DESC``.
    """
    ds = _parse_iso_date(date_start)
    de = _parse_iso_date(date_end)
    async with with_conn() as conn:
        rows = await ShiftRepository(conn).list_assignments_for_range(
            date_start=ds, date_end=de, cell_id=cell_id
        )
    return [ShiftAssignmentOut.model_validate(dict(r)).model_dump(mode="json") for r in rows]


@mcp.tool()
async def get_work_orders(
    cell_id: int | None = None,
    status: str | None = None,
    date_start: str | None = None,
    date_end: str | None = None,
    priority: str | None = None,
    generated_by_agent: bool | None = None,
    limit: int = _DEFAULT_LIMIT,
) -> list[dict]:
    """Work orders matching the given filters.

    All filters are optional — combine ``status='open'`` with ``priority='critical'``
    to surface "what's burning right now", or ``generated_by_agent=True`` to inspect
    agent output history.

    Args:
        cell_id: Restrict to one cell (omit for all cells).
        status: ``detected``, ``analyzed``, ``open``, ``in_progress``, ``completed``,
            ``cancelled``.
        date_start: ISO-8601 with TZ — filter on ``created_at`` (inclusive).
        date_end: ISO-8601 with TZ — filter on ``created_at`` (exclusive).
        priority: ``low``, ``medium``, ``high``, ``critical``.
        generated_by_agent: True → only agent-generated WOs, False → only manual.
        limit: Max rows returned (default 200).

    Returns:
        List of ``WorkOrderOut`` dicts ordered by ``created_at DESC``.
    """
    ws = parse_tz_aware(date_start) if date_start is not None else None
    we = parse_tz_aware(date_end) if date_end is not None else None
    async with with_conn() as conn:
        rows = await WorkOrderRepository(conn).list(
            cell_id=cell_id,
            status=status,
            limit=limit,
            date_start=ws,
            date_end=we,
            priority=priority,
            generated_by_agent=generated_by_agent,
        )
    return [WorkOrderOut.model_validate(dict(r)).model_dump(mode="json") for r in rows]
