"""``WS /api/v1/agent/chat`` — streamed maintenance-assistant chat.

Issue #31 (M5.2). Thin WebSocket router that:

1. Authenticates the handshake via ``require_access_cookie`` (#23 shared
   helper — same path used by ``WS /api/v1/events``).
2. Accepts the socket and holds the per-connection ``messages: list[dict]``
   state across turns.
3. For every inbound ``{"type": "user", "content": str}`` frame, delegates
   to :func:`agents.qa.run_qa_turn` (Messages API). The frame contract
   matches ``ChatMap`` in ``frontend/src/lib/ws.types.ts``.

The M5.4 Managed Agents path on Q&A was removed in M5.5 (#103) — the
audit ([docs/audits/M5-managed-agents-refactor-audit.md]) concluded that
interactive sub-second Q&A is the wrong target for Managed Agents. The
Investigator is the Managed Agents anchor now; Q&A stays on the Messages
API loop where token-granular streaming is native.
"""

from __future__ import annotations

import logging
from typing import Any

from agents.qa import run_qa_turn
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

    # Per-connection message history — appended on every turn.
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
