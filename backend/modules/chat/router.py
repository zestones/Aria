"""``WS /api/v1/agent/chat`` — streamed maintenance-assistant chat.

Issue #31 (M5.2) + #33 (M5.4). Thin WebSocket router that:

1. Authenticates the handshake via ``require_access_cookie`` (#23 shared
   helper — same path used by ``WS /api/v1/events``).
2. Accepts the socket and holds the per-connection state. For M5.2 this
   is a ``messages: list[dict]``; for M5.4 Managed Agents it is a
   ``session_state: dict`` (where the Anthropic-side ``session_id`` is
   cached). Branching happens once per connection on the
   ``use_managed_agents`` setting.
3. For every inbound ``{"type": "user", "content": str}`` frame, delegates
   to either :func:`agents.qa_agent.run_qa_turn` (Messages API, M5.2) or
   :func:`agents.qa_agent_managed.run_qa_turn_managed` (Managed Agents,
   M5.4). Both drive one agent turn to completion and stream frames back
   through the same socket — identical wire contract.
"""

from __future__ import annotations

import logging
from typing import Any

from agents.qa_agent import run_qa_turn
from agents.qa_agent_managed import run_qa_turn_managed
from core.config import get_settings
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

    use_managed = get_settings().use_managed_agents
    # Per-connection state. M5.2 keeps a local message list; M5.4 only
    # caches the Anthropic session_id (history lives server-side).
    messages: list[dict[str, Any]] = []
    session_state: dict[str, Any] = {}
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

            if use_managed:
                await run_qa_turn_managed(ws=ws, session_state=session_state, user_content=content)
            else:
                await run_qa_turn(ws=ws, messages=messages, user_content=content)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001 — one bad WS must not crash the app
        log.exception("agent_chat_ws unexpected error")
