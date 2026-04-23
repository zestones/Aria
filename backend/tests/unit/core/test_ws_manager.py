"""Tests for ``core.ws_manager`` (issue #23 / M4.1).

Covers:
- ``broadcast`` reaches every connected socket.
- Closed/dead sockets are silently dropped, not raised to the caller.
- ``current_turn_id`` ContextVar is auto-injected when set, omitted when not.
- Smoke test: a broadcast reaches a connected websocket within 100 ms
  (acceptance addition from issue #23 comment 1).
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

import pytest
from core.ws_manager import WSManager, current_turn_id, ws_manager


class _FakeWS:
    """Stand-in for ``starlette.websockets.WebSocket``.

    Mimics only the surface ``WSManager`` touches: ``accept``, ``send_text``,
    ``close``, plus a ``client_state`` attribute compared against
    ``WebSocketState.CONNECTED``.
    """

    def __init__(self, *, fail_on_send: bool = False, disconnected: bool = False) -> None:
        self.sent: list[str] = []
        self.accepted = False
        self.fail_on_send = fail_on_send
        # Mimic starlette's enum value comparison via duck typing — anything
        # not equal to the imported CONNECTED sentinel will be treated as dead.
        from starlette.websockets import WebSocketState

        self.client_state = (
            WebSocketState.DISCONNECTED if disconnected else WebSocketState.CONNECTED
        )

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, text: str) -> None:
        if self.fail_on_send:
            raise RuntimeError("socket exploded")
        self.sent.append(text)


@pytest.fixture
def mgr() -> WSManager:
    return WSManager()


@pytest.mark.asyncio
async def test_connect_accepts_and_registers(mgr: WSManager) -> None:
    ws = _FakeWS()
    await mgr.connect(ws)  # type: ignore[arg-type]
    assert ws.accepted is True
    assert ws in mgr.connections


def test_disconnect_is_idempotent(mgr: WSManager) -> None:
    ws = _FakeWS()
    mgr._connections.add(ws)  # type: ignore[arg-type]
    mgr.disconnect(ws)  # type: ignore[arg-type]
    mgr.disconnect(ws)  # type: ignore[arg-type]  # no raise
    assert ws not in mgr.connections


@pytest.mark.asyncio
async def test_broadcast_fans_out_to_all_sockets(mgr: WSManager) -> None:
    a, b = _FakeWS(), _FakeWS()
    await mgr.connect(a)  # type: ignore[arg-type]
    await mgr.connect(b)  # type: ignore[arg-type]

    await mgr.broadcast("anomaly_detected", {"cell_id": 2, "value": 9.1})

    for ws in (a, b):
        assert len(ws.sent) == 1
        frame = json.loads(ws.sent[0])
        assert frame == {"type": "anomaly_detected", "cell_id": 2, "value": 9.1}


@pytest.mark.asyncio
async def test_broadcast_drops_failing_sockets(mgr: WSManager) -> None:
    good = _FakeWS()
    bad = _FakeWS(fail_on_send=True)
    await mgr.connect(good)  # type: ignore[arg-type]
    await mgr.connect(bad)  # type: ignore[arg-type]

    await mgr.broadcast("ui_render", {"agent": "kb_builder"})

    assert good in mgr.connections
    assert bad not in mgr.connections
    assert len(good.sent) == 1


@pytest.mark.asyncio
async def test_broadcast_drops_disconnected_sockets(mgr: WSManager) -> None:
    dead = _FakeWS(disconnected=True)
    await mgr.connect(dead)  # type: ignore[arg-type]
    await mgr.broadcast("agent_end", {"agent": "x", "finish_reason": "ok"})
    assert dead not in mgr.connections
    assert dead.sent == []  # send_text was never even attempted


@pytest.mark.asyncio
async def test_broadcast_no_connections_is_noop(mgr: WSManager) -> None:
    # Must not raise even when nobody is listening.
    await mgr.broadcast("agent_start", {"agent": "x"})


@pytest.mark.asyncio
async def test_broadcast_injects_turn_id_from_contextvar(mgr: WSManager) -> None:
    ws = _FakeWS()
    await mgr.connect(ws)  # type: ignore[arg-type]

    token = current_turn_id.set("abc-123")
    try:
        await mgr.broadcast("ui_render", {"agent": "kb_builder"})
    finally:
        current_turn_id.reset(token)

    frame = json.loads(ws.sent[0])
    assert frame["turn_id"] == "abc-123"


@pytest.mark.asyncio
async def test_broadcast_omits_turn_id_when_not_set(mgr: WSManager) -> None:
    ws = _FakeWS()
    await mgr.connect(ws)  # type: ignore[arg-type]
    await mgr.broadcast("ui_render", {"agent": "kb_builder"})
    frame = json.loads(ws.sent[0])
    assert "turn_id" not in frame


@pytest.mark.asyncio
async def test_broadcast_explicit_turn_id_is_preserved(mgr: WSManager) -> None:
    ws = _FakeWS()
    await mgr.connect(ws)  # type: ignore[arg-type]

    token = current_turn_id.set("from-context")
    try:
        await mgr.broadcast("ui_render", {"agent": "x", "turn_id": "explicit"})
    finally:
        current_turn_id.reset(token)

    frame = json.loads(ws.sent[0])
    assert frame["turn_id"] == "explicit"


@pytest.mark.asyncio
async def test_module_singleton_is_reusable() -> None:
    """Acceptance smoke test (#23 comment 1) — a broadcast on the shipped
    ``ws_manager`` singleton reaches a connected socket within 100 ms.
    """
    ws = _FakeWS()
    await ws_manager.connect(ws)  # type: ignore[arg-type]
    try:
        start = time.perf_counter()
        await asyncio.wait_for(
            ws_manager.broadcast("agent_start", {"agent": "smoke"}),
            timeout=0.1,
        )
        elapsed_ms = (time.perf_counter() - start) * 1000
    finally:
        ws_manager.disconnect(ws)  # type: ignore[arg-type]

    assert elapsed_ms < 100
    assert len(ws.sent) == 1
    frame = json.loads(ws.sent[0])
    assert frame["type"] == "agent_start"


@pytest.mark.asyncio
async def test_broadcast_drops_unserialisable_payload(mgr: WSManager) -> None:
    ws = _FakeWS()
    await mgr.connect(ws)  # type: ignore[arg-type]

    class _NotJSON:
        pass

    # ``default=str`` in the encoder means most things serialise; force a
    # genuine TypeError by passing a circular reference.
    bad: dict[str, Any] = {}
    bad["self"] = bad

    await mgr.broadcast("ui_render", bad)
    # No frame sent, no raise.
    assert ws.sent == []
    assert ws in mgr.connections  # socket itself is still healthy
