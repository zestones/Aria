"""Small helpers for asyncpg.Record narrowing.

`Connection.fetchrow` returns `Record | None`. When the SQL is an
INSERT ... RETURNING or a SELECT-by-id we just inserted, the result
is guaranteed non-None — but pyright cannot know that. These helpers
narrow the type with a clear error message if our invariant is ever
broken at runtime (e.g. row vanished due to a race).
"""

from __future__ import annotations

import asyncpg


def must(row: asyncpg.Record | None, *, what: str = "row") -> asyncpg.Record:
    """Assert a fetched row is present and return it (narrows Optional)."""
    if row is None:
        raise RuntimeError(f"Expected {what} to exist but got None")
    return row
