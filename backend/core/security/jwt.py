"""JWT token creation / verification (HS256)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import jwt as pyjwt

from core.config import get_settings

ALGO = "HS256"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(user_id: int, username: str, role: str) -> tuple[str, datetime]:
    s = get_settings()
    expires_at = _now() + timedelta(minutes=s.jwt_access_ttl_minutes)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "type": "access",
        "exp": expires_at,
        "iat": _now(),
    }
    return pyjwt.encode(payload, s.jwt_secret_key, algorithm=ALGO), expires_at


def create_refresh_token(user_id: int, token_version: int) -> tuple[str, datetime]:
    s = get_settings()
    expires_at = _now() + timedelta(days=s.jwt_refresh_ttl_days)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": "refresh",
        "tv": token_version,
        "exp": expires_at,
        "iat": _now(),
    }
    return pyjwt.encode(payload, s.jwt_secret_key, algorithm=ALGO), expires_at


def _decode(token: str) -> dict[str, Any] | None:
    s = get_settings()
    try:
        return pyjwt.decode(token, s.jwt_secret_key, algorithms=[ALGO])
    except pyjwt.PyJWTError:
        return None


def verify_access_token(token: str) -> dict[str, Any] | None:
    p = _decode(token)
    return p if p and p.get("type") == "access" else None


def verify_refresh_token(token: str) -> dict[str, Any] | None:
    p = _decode(token)
    return p if p and p.get("type") == "refresh" else None


def access_ttl_seconds() -> int:
    return get_settings().jwt_access_ttl_minutes * 60


def refresh_ttl_seconds() -> int:
    return get_settings().jwt_refresh_ttl_days * 24 * 3600
