"""Datetime helpers shared across MCP tools.

Centralised TZ parsing — every MCP tool window param goes through ``parse_tz_aware``
to guarantee TimescaleDB receives ``timestamptz`` without silent UTC coercion.
"""

from __future__ import annotations

from datetime import datetime


def parse_tz_aware(s: str) -> datetime:
    """Parse an ISO-8601 string and require explicit TZ offset.

    Raises ``ValueError`` if the input has no timezone information. This avoids
    the silent failure where a naïve ``datetime`` is compared against a
    ``timestamptz`` column under the session timezone.
    """
    # ``datetime.fromisoformat`` accepts both ``...Z`` (Python 3.11+) and
    # ``...+00:00`` forms. Normalise the trailing ``Z`` for older parsers.
    raw = s.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        raise ValueError(
            f"datetime {s!r} is timezone-naïve; "
            "ISO-8601 with offset (e.g. '2026-04-22T13:00:00Z') is required"
        )
    return dt
