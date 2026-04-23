"""Temporary WebSocket broadcast stub — replace with ``ws_manager`` when M4.1 lands.

Issue #22 (M3.6) wires `ui_render` events into the KB Builder pipeline so the
frontend Activity Feed and Onboarding wizard can render progress in real time.
M4.1 (#23) introduces ``core.ws_manager.WSManager`` which owns the actual
WebSocket fan-out; until that ships, every call site fires through this shim
so the swap is one diff::

    # before (M3.6)
    from agents.kb_builder._ws_stub import broadcast_stub
    await broadcast_stub("ui_render", {...})

    # after (M4.1)
    from core.ws_manager import ws_manager
    await ws_manager.broadcast("ui_render", {...})

The payload shape this stub accepts is the contract documented in issue #23
and reproduced in #22 §1 — keep them aligned so callers do not need to be
edited again at swap time. The stub is intentionally awaitable so callers
already use ``await`` and the eventual swap is purely textual.

This module emits no WebSocket frames and has no side-effects beyond a single
``logging`` call. It must not import ``WebSocket`` or anything from
``core.ws_manager`` to avoid a circular dependency once that module exists.
"""

from __future__ import annotations

import json
import logging
from typing import Any

_log = logging.getLogger("aria.kb_builder.ws_stub")


async def broadcast_stub(event_type: str, payload: dict[str, Any]) -> None:
    """Log a structured representation of a future WebSocket broadcast.

    The first positional arg matches ``WSManager.broadcast``'s signature
    (``event_type``, ``payload``) so the M4.1 swap is mechanical.

    Args:
        event_type: One of the event types listed in issue #23 (here, almost
            always ``"ui_render"``).
        payload: The JSON-serialisable dict that will become the WebSocket
            frame's body. Logged as a single line so it can be grepped from
            container logs during demo prep.
    """
    try:
        rendered = json.dumps(payload, default=str, separators=(",", ":"))
    except (TypeError, ValueError):
        rendered = repr(payload)
    _log.info("ws_stub event=%s payload=%s", event_type, rendered)
