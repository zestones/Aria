"""Shared helpers for ARIA MCP tools.

Keeps tool sub-modules thin: every tool acquires a connection via
``_with_conn()`` and reuses the same parsing/validation primitives.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import timedelta
from typing import AsyncIterator

import asyncpg
from core.database import db

_AGGREGATION_INTERVALS: dict[str, timedelta] = {
    "10s": timedelta(seconds=10),
    "30s": timedelta(seconds=30),
    "1m": timedelta(minutes=1),
    "5m": timedelta(minutes=5),
    "15m": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "1d": timedelta(days=1),
}


@asynccontextmanager
async def with_conn() -> AsyncIterator[asyncpg.Connection]:
    """Acquire+release a pooled DB connection for one tool call."""
    async with db.pool.acquire() as conn:
        yield conn


def parse_aggregation(s: str) -> timedelta:
    """Resolve an aggregation token (e.g. ``"1m"``) to a ``timedelta``.

    Raises ``ValueError`` for unsupported values.
    """
    if s not in _AGGREGATION_INTERVALS:
        valid = ", ".join(_AGGREGATION_INTERVALS.keys())
        raise ValueError(f"aggregation {s!r} not supported; expected one of: {valid}")
    return _AGGREGATION_INTERVALS[s]
