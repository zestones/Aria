"""``WS /api/v1/agent/chat`` — streamed maintenance-assistant chat.

Issue #31 (M5.2). Thin WebSocket router that:

1. Authenticates the handshake via ``require_access_cookie`` (#23 shared
   helper — same path used by ``WS /api/v1/events``).
2. Accepts the socket and holds the per-connection ``messages: list[dict]``
   state. Multi-turn memory lives here, not in the agent module.
3. For every inbound ``{"type": "user", "content": str}`` frame, delegates
   to :func:`agents.qa_agent.run_qa_turn` which drives the agent loop and
   streams frames back through the same socket.

The agent module is intentionally pure (no router-side globals) so that
#33 (Managed Agents migration) can swap the call site behind a feature
flag without touching the router.
"""

from __future__ import annotations

import logging
from typing import Any

from agents.qa_agent import run_qa_turn
from core.security.ws_auth import require_access_cookie
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

log = logging.getLogger("aria.chat.ws")

router = APIRouter(prefix="/api/v1/agent", tags=["chat"])


@router.websocket("/chat")
async def agent_chat_ws(ws: WebSocket) -> None:
    """Stream an agent chat session over a single authenticated WebSocket."""
    user = await require_access_cookie(ws)
    if user is None:
        return  # socket already closed with code 4401
    await ws.accept()

    # Per-connection chat history. Grows until the client disconnects.
    messages: list[dict[str, Any]] = []
    try:
        while True:
            inbound = await ws.receive_json()
            if not isinstance(inbound, dict):
                await ws.send_json({"type": "done", "error": "malformed frame"})
                continue
            if inbound.get("type") != "user":
                # Unknown client frames are acknowledged as done+error so the
                # frontend input is not left spinning, but the session stays open.
                await ws.send_json(
                    {"type": "done", "error": f"unknown frame type {inbound.get('type')!r}"}
                )
                continue

            content = inbound.get("content")
            if not isinstance(content, str):
                await ws.send_json({"type": "done", "error": "content must be a string"})
                continue

            await run_qa_turn(ws=ws, messages=messages, user_content=content)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001 — one bad WS must not crash the app
        log.exception("agent_chat_ws unexpected error")
