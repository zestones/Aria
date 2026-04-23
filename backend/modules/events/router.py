"""``WS /api/v1/events`` — single global WebSocket topic for telemetry.

Issue #23 (M4.1). All agents broadcast through ``ws_manager``; the frontend
filters by ``cell_id`` in payloads. JWT access-cookie auth via
``require_access_cookie``.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.security.ws_auth import require_access_cookie
from core.ws_manager import ws_manager

log = logging.getLogger("aria.events.ws")

router = APIRouter(prefix="/api/v1", tags=["events"])


@router.websocket("/events")
async def events_ws(ws: WebSocket) -> None:
    user = await require_access_cookie(ws)
    if user is None:
        return
    await ws_manager.connect(ws)
    try:
        # Drain client → server frames so the connection stays open. The
        # `/events` topic is server → client only; any inbound frame is
        # ignored.
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(ws)
