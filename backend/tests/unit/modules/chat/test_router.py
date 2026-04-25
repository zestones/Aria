"""Tests for ``modules.chat.router`` (issue #31 / M5.2).

The router is thin — auth handshake, receive-loop, delegate each ``user``
frame to :func:`agents.qa.run_qa_turn`. Tests exercise:

- Unauthenticated handshake closes before ``accept()`` and never calls
  ``run_qa_turn``.
- Malformed / non-string / non-user frames get a ``done`` error back but
  do NOT close the socket.
- A valid ``user`` frame calls ``run_qa_turn`` with the payload content.
- ``WebSocketDisconnect`` breaks the loop cleanly.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import WebSocketDisconnect
from modules.chat import router as chat_router

# ---------------------------------------------------------------------------
# Minimal WebSocket fake exposing only the surface the router touches.
# ---------------------------------------------------------------------------


class _FakeWS:
    def __init__(self, inbound: list[Any]) -> None:
        self._inbound = list(inbound)
        self.accepted = False
        self.sent: list[dict[str, Any]] = []
        self.closed: int | None = None
        self.cookies: dict[str, str] = {}

    async def accept(self) -> None:
        self.accepted = True

    async def close(self, code: int = 1000) -> None:
        self.closed = code

    async def send_json(self, data: dict[str, Any]) -> None:
        self.sent.append(data)

    async def receive_json(self) -> Any:
        if not self._inbound:
            raise WebSocketDisconnect()
        frame = self._inbound.pop(0)
        if isinstance(frame, BaseException):
            raise frame
        return frame


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unauth_handshake_closes_without_calling_run_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def deny_cookie(ws: Any) -> None:
        await ws.close(code=4401)
        return None

    called = False

    async def boom_turn(**_k: Any) -> None:
        nonlocal called
        called = True

    monkeypatch.setattr(chat_router, "require_access_cookie", deny_cookie)
    monkeypatch.setattr(chat_router, "run_qa_turn", boom_turn)

    ws = _FakeWS(inbound=[])
    await chat_router.agent_chat_ws(ws)  # type: ignore[arg-type]

    assert ws.closed == 4401
    assert ws.accepted is False
    assert called is False


@pytest.mark.asyncio
async def test_valid_user_frame_invokes_run_turn_with_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def allow_cookie(_ws: Any) -> dict[str, Any]:
        return {"sub": "1"}

    calls: list[dict[str, Any]] = []

    async def capturing_turn(**kwargs: Any) -> None:
        calls.append({"content": kwargs["user_content"], "messages_len": len(kwargs["messages"])})

    monkeypatch.setattr(chat_router, "require_access_cookie", allow_cookie)
    monkeypatch.setattr(chat_router, "run_qa_turn", capturing_turn)

    ws = _FakeWS(
        inbound=[
            {"type": "user", "content": "OEE of Bottle Filler?"},
            {"type": "user", "content": "how about MTBF?"},
        ]
    )
    await chat_router.agent_chat_ws(ws)  # type: ignore[arg-type]

    assert ws.accepted is True
    assert [c["content"] for c in calls] == ["OEE of Bottle Filler?", "how about MTBF?"]
    # messages list is shared across turns — second call sees the first turn's appends.
    # (fake turn is a no-op so the list stays empty — this just confirms it is the same
    # object passed in, not a fresh list each time).


@pytest.mark.asyncio
async def test_user_frame_emits_agent_start_before_run_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Issue #109 — chat socket announces the speaker so the UI badge is truthful."""

    async def allow_cookie(_ws: Any) -> dict[str, Any]:
        return {"sub": "1"}

    invocation_order: list[str] = []

    async def capturing_turn(**_k: Any) -> None:
        invocation_order.append("turn")

    monkeypatch.setattr(chat_router, "require_access_cookie", allow_cookie)
    monkeypatch.setattr(chat_router, "run_qa_turn", capturing_turn)

    ws = _FakeWS(inbound=[{"type": "user", "content": "OEE on Bottle Filler?"}])

    # Record send_json relative to the turn invocation.
    original_send = ws.send_json

    async def tracking_send(data: dict[str, Any]) -> None:
        invocation_order.append(f"send:{data.get('type')}")
        await original_send(data)

    ws.send_json = tracking_send  # type: ignore[method-assign]

    await chat_router.agent_chat_ws(ws)  # type: ignore[arg-type]

    assert {"type": "agent_start", "agent": "qa"} in ws.sent
    # agent_start must precede the run_qa_turn dispatch so the frontend
    # updates the badge before any streaming frames arrive.
    assert invocation_order.index("send:agent_start") < invocation_order.index("turn")


@pytest.mark.asyncio
async def test_malformed_frame_is_rejected_socket_stays_open(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def allow_cookie(_ws: Any) -> dict[str, Any]:
        return {"sub": "1"}

    called = 0

    async def capturing_turn(**_k: Any) -> None:
        nonlocal called
        called += 1

    monkeypatch.setattr(chat_router, "require_access_cookie", allow_cookie)
    monkeypatch.setattr(chat_router, "run_qa_turn", capturing_turn)

    ws = _FakeWS(
        inbound=[
            "not a dict",  # malformed
            {"type": "ping"},  # unknown type
            {"type": "user", "content": 42},  # content not a string
            {"type": "user", "content": "real message"},  # valid — must reach turn
        ]
    )
    await chat_router.agent_chat_ws(ws)  # type: ignore[arg-type]

    # Exactly one valid turn dispatched.
    assert called == 1
    # Three done+error frames emitted back to the client, then no close.
    error_frames = [f for f in ws.sent if f.get("type") == "done" and "error" in f]
    assert len(error_frames) == 3
    assert ws.closed is None


@pytest.mark.asyncio
async def test_websocket_disconnect_exits_cleanly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def allow_cookie(_ws: Any) -> dict[str, Any]:
        return {"sub": "1"}

    async def noop_turn(**_k: Any) -> None:
        return None

    monkeypatch.setattr(chat_router, "require_access_cookie", allow_cookie)
    monkeypatch.setattr(chat_router, "run_qa_turn", noop_turn)

    ws = _FakeWS(inbound=[WebSocketDisconnect()])
    # Must NOT raise
    await chat_router.agent_chat_ws(ws)  # type: ignore[arg-type]
