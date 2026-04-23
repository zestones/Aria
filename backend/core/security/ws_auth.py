"""WebSocket cookie auth — JWT access-cookie validation for WS endpoints.

Issue #23 (M4.1) gates ``WS /api/v1/events``. Reused by #31 for the agent
chat WS. Closes the socket with ``4401`` (custom WS close code, RFC 6455
private range) on missing or invalid token so the frontend can distinguish
auth failure from generic disconnects.
"""

from __future__ import annotations

from typing import Any

from core.security.cookies import ACCESS_COOKIE
from core.security.jwt import verify_access_token
from fastapi import WebSocket

# Custom WS close code in the 4000-4999 application range.
WS_AUTH_FAILED = 4401


async def require_access_cookie(ws: WebSocket) -> dict[str, Any] | None:
    """Validate the ``access_token`` cookie on a WebSocket handshake.

    Returns the decoded JWT payload on success. On failure, closes the
    socket with code :data:`WS_AUTH_FAILED` and returns ``None`` — callers
    should ``return`` immediately.
    """
    token = ws.cookies.get(ACCESS_COOKIE)
    if not token:
        await ws.close(code=WS_AUTH_FAILED)
        return None
    payload = verify_access_token(token)
    if payload is None:
        await ws.close(code=WS_AUTH_FAILED)
        return None
    return payload
