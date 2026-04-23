"""Tests for ``core.security.ws_auth.require_access_cookie`` (issue #23)."""

from __future__ import annotations

import pytest
from core.security import ws_auth
from core.security.cookies import ACCESS_COOKIE
from core.security.ws_auth import WS_AUTH_FAILED, require_access_cookie


class _FakeWS:
    def __init__(self, cookies: dict[str, str] | None = None) -> None:
        self.cookies: dict[str, str] = cookies or {}
        self.closed_with: int | None = None

    async def close(self, code: int) -> None:
        self.closed_with = code


@pytest.mark.asyncio
async def test_missing_cookie_closes_with_4401(monkeypatch):
    ws = _FakeWS()
    out = await require_access_cookie(ws)  # type: ignore[arg-type]
    assert out is None
    assert ws.closed_with == WS_AUTH_FAILED


@pytest.mark.asyncio
async def test_invalid_token_closes_with_4401(monkeypatch):
    ws = _FakeWS({ACCESS_COOKIE: "garbage.jwt.value"})
    monkeypatch.setattr(ws_auth, "verify_access_token", lambda _t: None)
    out = await require_access_cookie(ws)  # type: ignore[arg-type]
    assert out is None
    assert ws.closed_with == WS_AUTH_FAILED


@pytest.mark.asyncio
async def test_valid_token_returns_payload(monkeypatch):
    ws = _FakeWS({ACCESS_COOKIE: "good.jwt.value"})
    monkeypatch.setattr(ws_auth, "verify_access_token", lambda _t: {"sub": "u1", "type": "access"})
    out = await require_access_cookie(ws)  # type: ignore[arg-type]
    assert out == {"sub": "u1", "type": "access"}
    assert ws.closed_with is None
