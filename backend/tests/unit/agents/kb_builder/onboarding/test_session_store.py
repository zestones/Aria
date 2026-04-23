"""``session_store`` TTL + indexing (M3.3 — issue #19 §2, §8).

Module-level dicts are mutated by every test, so each test resets them
explicitly. Tests do not touch any external system.
"""

from __future__ import annotations

import time

import pytest
from agents.kb_builder.onboarding import session_store
from agents.kb_builder.onboarding.session_store import OnboardingSession, cleanup_expired, drop


@pytest.fixture(autouse=True)
def _reset_store():
    session_store.SESSIONS.clear()
    session_store.SESSIONS_BY_CELL.clear()
    yield
    session_store.SESSIONS.clear()
    session_store.SESSIONS_BY_CELL.clear()


def _add(session_id: str, cell_id: int, age_seconds: float = 0.0) -> OnboardingSession:
    s = OnboardingSession(
        session_id=session_id,
        cell_id=cell_id,
        created_at=time.time() - age_seconds,
    )
    session_store.SESSIONS[session_id] = s
    session_store.SESSIONS_BY_CELL[cell_id] = session_id
    return s


@pytest.mark.unit
def test_cleanup_drops_only_expired_sessions():
    fresh = _add("fresh", cell_id=1, age_seconds=10)
    expired = _add("expired", cell_id=2, age_seconds=session_store.SESSION_TTL + 5)

    cleanup_expired()

    assert "fresh" in session_store.SESSIONS
    assert session_store.SESSIONS_BY_CELL.get(1) == fresh.session_id
    assert "expired" not in session_store.SESSIONS
    assert 2 not in session_store.SESSIONS_BY_CELL
    _ = expired  # keep linter happy


@pytest.mark.unit
def test_cleanup_does_not_drop_secondary_index_for_replaced_session():
    # If a stale entry's secondary index has been overwritten by a newer
    # session for the same cell, cleanup must NOT pop the new one out.
    _add("stale", cell_id=1, age_seconds=session_store.SESSION_TTL + 5)
    # Manually override the secondary index to simulate a fresh session
    # taking over (would normally be caught by the start_onboarding gate,
    # but defensive behaviour matters when TTL races a new start).
    fresh = OnboardingSession(session_id="new", cell_id=1)
    session_store.SESSIONS["new"] = fresh
    session_store.SESSIONS_BY_CELL[1] = "new"

    cleanup_expired()

    assert "stale" not in session_store.SESSIONS
    assert session_store.SESSIONS["new"] is fresh
    assert session_store.SESSIONS_BY_CELL[1] == "new"


@pytest.mark.unit
def test_drop_removes_from_both_indexes():
    s = _add("sid", cell_id=42)

    drop(s)

    assert "sid" not in session_store.SESSIONS
    assert 42 not in session_store.SESSIONS_BY_CELL


@pytest.mark.unit
def test_drop_is_idempotent():
    s = _add("sid", cell_id=42)
    drop(s)
    # Second call must not raise.
    drop(s)
    assert "sid" not in session_store.SESSIONS
