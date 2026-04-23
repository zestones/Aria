"""In-process onboarding session store.

Two indexes are kept in sync:

- ``SESSIONS`` — primary, ``session_id -> OnboardingSession``.
- ``SESSIONS_BY_CELL`` — secondary, ``cell_id -> session_id``. Lets
  ``service.start_onboarding`` reject a second concurrent session for the
  same cell without scanning every entry.

Sessions expire after :data:`SESSION_TTL` seconds. Cleanup is synchronous —
:func:`cleanup_expired` runs at the top of every public service handler
instead of a background task. This is deliberate demo scope; a multi-worker
deployment would need Redis-backed sessions (see issue #19 §2).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

log = logging.getLogger("aria.kb_builder.onboarding.session_store")


SESSION_TTL = 30 * 60  # 30 minutes


@dataclass
class OnboardingSession:
    session_id: str
    cell_id: int
    messages: list[dict] = field(default_factory=list)
    question_index: int = 0
    created_at: float = field(default_factory=time.time)


SESSIONS: dict[str, OnboardingSession] = {}
SESSIONS_BY_CELL: dict[int, str] = {}


def cleanup_expired() -> None:
    """Drop sessions older than :data:`SESSION_TTL` from both indexes."""
    now = time.time()
    expired = [sid for sid, s in SESSIONS.items() if now - s.created_at > SESSION_TTL]
    for sid in expired:
        cell_id = SESSIONS[sid].cell_id
        SESSIONS.pop(sid, None)
        if SESSIONS_BY_CELL.get(cell_id) == sid:
            SESSIONS_BY_CELL.pop(cell_id, None)
    if expired:
        log.info("onboarding: cleaned %d expired session(s)", len(expired))


def drop(session: OnboardingSession) -> None:
    """Remove ``session`` from both indexes (no-op if already gone)."""
    SESSIONS.pop(session.session_id, None)
    if SESSIONS_BY_CELL.get(session.cell_id) == session.session_id:
        SESSIONS_BY_CELL.pop(session.cell_id, None)
