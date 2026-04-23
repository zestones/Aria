"""WebSocket broadcast manager — single global topic, per-event JSON frames.

Issue #23 (M4.1). Backs ``WS /api/v1/events``. All agents and routers fan
out telemetry through the module-level :data:`ws_manager` singleton::

    from core.ws_manager import ws_manager, current_turn_id

    current_turn_id.set(uuid.uuid4().hex)        # orchestrator, per turn
    await ws_manager.broadcast("anomaly_detected", {...})

The frontend filters by ``cell_id`` in the payload — see
``frontend/src/lib/ws.types.ts`` (``EventBusMap``) for the shipped contract.
That file is the source of truth for field names; any backend payload bump
requires a coordinated bump there.

The ``turn_id`` ``ContextVar`` is read inside :meth:`WSManager.broadcast` so
agents do not have to thread it through every call. The orchestrator
(#26) sets it on each ``agent_start``; until that lands, callers leave
``turn_id`` absent and the field is simply omitted from the frame.
"""

from __future__ import annotations

import json
import logging
from contextvars import ContextVar
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketState

log = logging.getLogger("aria.ws_manager")

# Per-agent-turn correlation id (UUID v4 hex). Set by the orchestrator on
# ``agent_start`` and propagated automatically into every broadcast frame.
current_turn_id: ContextVar[str | None] = ContextVar("aria_turn_id", default=None)


class WSManager:
    """In-process fan-out for the single global ``/api/v1/events`` topic.

    Process-local state — fine for the demo's single uvicorn worker.
    Multi-worker deployments would need Redis pub/sub or similar.
    """

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    @property
    def connections(self) -> set[WebSocket]:
        """Read-only view of currently registered sockets (mostly for tests)."""
        return self._connections

    async def connect(self, ws: WebSocket) -> None:
        """Accept the handshake and register the socket."""
        await ws.accept()
        self._connections.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        """Remove the socket from the registry. Idempotent."""
        self._connections.discard(ws)

    async def broadcast(self, event_type: str, payload: dict[str, Any]) -> None:
        """Send ``{type, ...payload}`` as one JSON line to every connected ws.

        - ``turn_id`` is auto-populated from :data:`current_turn_id` if absent
          *and* a value is set in the current context.
        - Sockets that fail (closed, network error) are dropped silently from
          the registry — the broadcast never raises to the caller.
        """
        frame: dict[str, Any] = {"type": event_type, **payload}
        if "turn_id" not in frame:
            tid = current_turn_id.get()
            if tid is not None:
                frame["turn_id"] = tid

        try:
            text = json.dumps(frame, default=str, separators=(",", ":"))
        except (TypeError, ValueError):
            log.exception(
                "ws_manager: payload not JSON-serialisable, dropping event=%s", event_type
            )
            return

        if not self._connections:
            return

        dead: list[WebSocket] = []
        for ws in list(self._connections):
            if ws.client_state != WebSocketState.CONNECTED:
                dead.append(ws)
                continue
            try:
                await ws.send_text(text)
            except Exception:  # noqa: BLE001 — fan-out must never raise
                dead.append(ws)
        for ws in dead:
            self._connections.discard(ws)


# Module-level singleton — import from here.
ws_manager = WSManager()
