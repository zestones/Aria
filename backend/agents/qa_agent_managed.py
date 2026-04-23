"""Q&A agent — Claude **Managed Agents** path (issue #33 / M5.4).

Mirrors :func:`agents.qa_agent.run_qa_turn` in wire contract (same
``ChatMap`` frames to the WebSocket client, same events-bus broadcasts)
but drives the turn through ``client.beta.sessions.events.stream`` on a
server-side session maintained by Anthropic, instead of the manual
Messages API agent loop from M5.2.

Why this module exists
----------------------
- Eligibility for the **Best Managed Agents $5k** prize requires at
  least one agent in the hackathon to use the Managed Agents pattern.
  Q&A is the chosen agent (interactive, stateful, long-running).
- M5.2 is kept as the fallback — the router picks between
  :func:`run_qa_turn_managed` and :func:`agents.qa_agent.run_qa_turn`
  on the ``USE_MANAGED_AGENTS`` flag. If the managed path misbehaves
  during the demo, flipping the flag in ``.env`` restores M5.2 in <5
  min (acceptance item #2 on #33).

Event flow (per user turn)
--------------------------
1. ``events.stream`` is opened as an async context manager.
2. We ``events.send`` the ``user.message``.
3. We iterate the stream, forwarding:
   - ``agent.message`` → one or more ``text_delta`` frames (server-side
     chunking so the UI still fills word-by-word — see
     :func:`_trickle_text`).
   - ``agent.custom_tool_use`` → accumulate until the session idles.
4. On ``session.status_idle``:
   - ``stop_reason.type == "requires_action"`` → dispatch each pending
     tool (``_handle_render`` / ``_handle_ask_investigator`` / MCP),
     send back ``user.custom_tool_result`` events. Continue iterating.
   - ``stop_reason.type == "end_turn"`` → turn done; break.
5. ``done`` frame to the client (with ``error`` field if the loop
   raised).

Tool schema strategy — **custom tools, not hosted MCP**
-------------------------------------------------------
Each MCP tool schema, each ``render_*`` schema, and the
``ask_investigator`` schema is wrapped as a Managed-Agents custom tool
(``{"type": "custom", ...}``). The execution handler lives in this
process and reuses the exact dispatch helpers from :mod:`agents.qa_agent`
— so M5.2 and M5.4 run the same tool code. Hosted MCP was rejected
because it would require publicly exposing the ``/mcp`` endpoint to
Anthropic for zero prize value.

Bootstrap
---------
Agent + environment are created lazily on the first turn and cached
process-wide. A session is created per WebSocket connection on the
first user message and reused across turns, so the multi-turn history
lives in the Managed Agents server instead of a local ``messages: list``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, cast

from agents.anthropic_client import anthropic, model_for
from agents.qa_agent import (
    ASK_INVESTIGATOR_TOOL,
    QA_SYSTEM,
    _handle_ask_investigator,
    _handle_render,
    _safe_send,
    _summarise_tool_result,
)
from agents.ui_tools import QA_RENDER_TOOLS
from aria_mcp.client import mcp_client
from core.config import get_settings
from core.ws_manager import current_turn_id, ws_manager
from fastapi import WebSocket

log = logging.getLogger("aria.qa_agent_managed")

# Server-side text chunks that go out as ``text_delta`` frames. ~30 chars
# with a ~15 ms gap mimics the token-by-token trickle of M5.2 without
# making the user wait. Managed Agents emits ``agent.message`` events as
# complete blocks — there is no finer granularity available upstream.
_TRICKLE_CHUNK = 30
_TRICKLE_DELAY_S = 0.015

_AGENT_NAME = "aria-qa"
_ENV_NAME = "aria-qa-env"

# Process-wide cache. The agent definition and environment are immutable
# once created — the session (per-connection chat) is the thing that
# grows. `_bootstrap_lock` prevents two concurrent first-turns from
# racing to create duplicate agents/environments.
_bootstrap_lock = asyncio.Lock()
_agent_id: str | None = None
_environment_id: str | None = None


async def run_qa_turn_managed(
    *,
    ws: WebSocket,
    session_state: dict[str, Any],
    user_content: str,
) -> None:
    """Drive one user turn through a Managed Agents session.

    ``session_state`` is the router-owned dict that survives across
    turns on the same WebSocket — we store ``session_id`` in it on the
    first call so subsequent turns reuse the same Anthropic session and
    therefore the same conversation history (server-side).

    Matches :func:`agents.qa_agent.run_qa_turn` in wire contract: same
    ``ChatMap`` frames, same ``agent_start`` / ``agent_end`` broadcasts,
    same final ``done`` frame (with ``error`` on crash).
    """
    if not user_content.strip():
        await _safe_send(ws, {"type": "done", "error": "empty message"})
        return

    turn_id = uuid.uuid4().hex
    token = current_turn_id.set(turn_id)
    await ws_manager.broadcast("agent_start", {"agent": "qa", "turn_id": turn_id})

    finish_reason = "end_turn"
    error: str | None = None
    try:
        session_id = await _ensure_session(session_state)
        finish_reason = await _drive_turn(
            ws=ws, session_id=session_id, user_content=user_content, turn_id=turn_id
        )
    except Exception as exc:  # noqa: BLE001 — never let one bad turn take the WS down
        log.exception("qa managed turn crashed")
        finish_reason = "error"
        error = f"{type(exc).__name__}: {exc}"
    finally:
        await ws_manager.broadcast(
            "agent_end",
            {"agent": "qa", "turn_id": turn_id, "finish_reason": finish_reason},
        )
        current_turn_id.reset(token)

    done_frame: dict[str, Any] = {"type": "done"}
    if error is not None:
        done_frame["error"] = error
    await _safe_send(ws, done_frame)


# ---------------------------------------------------------------------------
# Bootstrap — lazy creation of the agent + environment + per-WS session
# ---------------------------------------------------------------------------


async def _ensure_session(session_state: dict[str, Any]) -> str:
    """Return a live session id, creating the session on first call."""
    if session_state.get("session_id"):
        return str(session_state["session_id"])

    agent_id, env_id = await _ensure_agent_and_env()
    beta = get_settings().managed_agents_beta
    session = await anthropic.beta.sessions.create(
        agent=cast(Any, {"id": agent_id, "type": "agent"}),
        environment_id=env_id,
        title="ARIA Q&A chat",
        betas=cast(Any, [beta]),
    )
    session_state["session_id"] = session.id
    log.info("created managed agents session %s", session.id)
    return str(session.id)


async def _ensure_agent_and_env() -> tuple[str, str]:
    """Create (once) the agent + environment and return their ids."""
    global _agent_id, _environment_id
    async with _bootstrap_lock:
        if _agent_id and _environment_id:
            return _agent_id, _environment_id

        beta = get_settings().managed_agents_beta

        env = await anthropic.beta.environments.create(
            name=_ENV_NAME,
            config={"type": "cloud"},
            betas=[beta],
        )
        _environment_id = env.id

        mcp_schemas = await mcp_client.get_tools_schema()
        agent = await anthropic.beta.agents.create(
            name=_AGENT_NAME,
            model=cast(Any, model_for("chat")),
            system=QA_SYSTEM,
            tools=cast(Any, _build_custom_tools(mcp_schemas)),
            betas=cast(Any, [beta]),
        )
        _agent_id = agent.id
        log.info("bootstrapped managed agent %s in environment %s", agent.id, env.id)
        return _agent_id, _environment_id


def _build_custom_tools(mcp_schemas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Wrap every tool schema as a Managed-Agents ``custom`` tool.

    Each input schema must have been declared locally (MCP / ui_tools /
    ASK_INVESTIGATOR_TOOL); we only relabel the outer envelope.
    """
    schemas: list[dict[str, Any]] = list(mcp_schemas)
    schemas.extend(QA_RENDER_TOOLS)
    schemas.append(ASK_INVESTIGATOR_TOOL)
    return [
        {
            "type": "custom",
            "name": s["name"],
            "description": s["description"],
            "input_schema": s["input_schema"],
        }
        for s in schemas
    ]


# ---------------------------------------------------------------------------
# Turn driver — stream events until end_turn, dispatch tools on requires_action
# ---------------------------------------------------------------------------


async def _drive_turn(
    *,
    ws: WebSocket,
    session_id: str,
    user_content: str,
    turn_id: str,
) -> str:
    """Stream one user turn to completion and return ``stop_reason.type``."""
    beta = get_settings().managed_agents_beta
    # {event_id -> (name, input)} — tool_use events arrive before the
    # idle that references them by id; we buffer so we can look them up.
    pending_tool_uses: dict[str, tuple[str, dict[str, Any]]] = {}

    stream_cm = await anthropic.beta.sessions.events.stream(session_id, betas=cast(Any, [beta]))
    async with stream_cm as stream:
        await anthropic.beta.sessions.events.send(
            session_id,
            events=cast(
                Any,
                [
                    {
                        "type": "user.message",
                        "content": [{"type": "text", "text": user_content}],
                    }
                ],
            ),
            betas=cast(Any, [beta]),
        )

        async for event in stream:
            done = await _handle_stream_event(
                ws=ws,
                event=event,
                session_id=session_id,
                pending=pending_tool_uses,
                turn_id=turn_id,
                beta=beta,
            )
            if done:
                return "end_turn"

    return "end_turn"


async def _handle_stream_event(
    *,
    ws: WebSocket,
    event: Any,
    session_id: str,
    pending: dict[str, tuple[str, dict[str, Any]]],
    turn_id: str,
    beta: str,
) -> bool:
    """Handle one stream event. Returns ``True`` when the turn is finished."""
    etype = getattr(event, "type", None)

    if etype == "agent.message":
        for block in getattr(event, "content", []) or []:
            text = getattr(block, "text", None)
            if text:
                await _trickle_text(ws, text)
        return False

    if etype == "agent.custom_tool_use":
        tu_id = getattr(event, "id", None)
        tu_input = getattr(event, "input", {}) or {}
        if tu_id:
            pending[tu_id] = (
                getattr(event, "name", ""),
                dict(tu_input) if isinstance(tu_input, dict) else {},
            )
        return False

    if etype == "session.status_idle":
        return await _handle_idle(
            ws=ws,
            event=event,
            session_id=session_id,
            pending=pending,
            turn_id=turn_id,
            beta=beta,
        )

    if etype == "session.status_terminated":
        raise RuntimeError("managed agents session terminated")

    if etype == "session.error":
        raise RuntimeError(f"managed agents session error: {getattr(event, 'error', None)!r}")

    return False


async def _handle_idle(
    *,
    ws: WebSocket,
    event: Any,
    session_id: str,
    pending: dict[str, tuple[str, dict[str, Any]]],
    turn_id: str,
    beta: str,
) -> bool:
    """Route a ``session.status_idle`` event. Returns True when turn ends."""
    stop_reason = getattr(event, "stop_reason", None)
    stop_type = getattr(stop_reason, "type", None)

    if stop_type == "end_turn":
        return True
    if stop_type == "requires_action":
        event_ids: list[str] = list(getattr(stop_reason, "event_ids", []) or [])
        await _resolve_pending_tools(
            ws=ws,
            session_id=session_id,
            event_ids=event_ids,
            pending=pending,
            turn_id=turn_id,
            beta=beta,
        )
        return False
    if stop_type == "retries_exhausted":
        raise RuntimeError("managed agents retries exhausted")
    # Unknown idle reasons: keep iterating; next events will clarify.
    return False


async def _resolve_pending_tools(
    *,
    ws: WebSocket,
    session_id: str,
    event_ids: list[str],
    pending: dict[str, tuple[str, dict[str, Any]]],
    turn_id: str,
    beta: str,
) -> None:
    """Execute each requested tool and send its result back to the agent."""
    for event_id in event_ids:
        entry = pending.pop(event_id, None)
        if entry is None:
            log.warning("managed agents requires_action references unknown event %s", event_id)
            # Still respond so the session does not hang forever.
            await anthropic.beta.sessions.events.send(
                session_id,
                events=cast(
                    Any,
                    [
                        {
                            "type": "user.custom_tool_result",
                            "custom_tool_use_id": event_id,
                            "content": [{"type": "text", "text": "tool_use event not found"}],
                            "is_error": True,
                        }
                    ],
                ),
                betas=cast(Any, [beta]),
            )
            continue

        name, args = entry
        content, is_error = await _dispatch_custom_tool(
            ws=ws, name=name, args=args, turn_id=turn_id
        )
        await anthropic.beta.sessions.events.send(
            session_id,
            events=cast(
                Any,
                [
                    {
                        "type": "user.custom_tool_result",
                        "custom_tool_use_id": event_id,
                        "content": [{"type": "text", "text": content}],
                        "is_error": is_error,
                    }
                ],
            ),
            betas=cast(Any, [beta]),
        )


async def _dispatch_custom_tool(
    *,
    ws: WebSocket,
    name: str,
    args: dict[str, Any],
    turn_id: str,
) -> tuple[str, bool]:
    """Run a single custom tool and emit the same chat frames as M5.2."""
    await ws_manager.broadcast(
        "tool_call_started",
        {"agent": "qa", "tool_name": name, "args": args, "turn_id": turn_id},
    )
    await _safe_send(ws, {"type": "tool_call", "name": name, "args": args})
    t0 = time.monotonic()

    try:
        if name.startswith("render_"):
            content, is_error = await _handle_render(ws, name, args, turn_id)
        elif name == "ask_investigator":
            content, is_error = await _handle_ask_investigator(ws, args, turn_id)
        else:
            result = await mcp_client.call_tool(name, args)
            content, is_error = result.content, result.is_error
    except Exception as exc:  # noqa: BLE001 — tool dispatch must never crash the loop
        log.exception("managed qa tool_use handler raised for %s", name)
        content = f"handler raised {type(exc).__name__}: {exc}"
        is_error = True

    duration_ms = int((time.monotonic() - t0) * 1000)
    await ws_manager.broadcast(
        "tool_call_completed",
        {
            "agent": "qa",
            "tool_name": name,
            "duration_ms": duration_ms,
            "turn_id": turn_id,
        },
    )
    # Content may be non-string when an MCP client returns structured
    # data; normalise for the JSON payload sent back to Anthropic.
    if not isinstance(content, str):
        try:
            content = json.dumps(content)
        except TypeError:
            content = str(content)
    summary = _summarise_tool_result(name, content, is_error)
    await _safe_send(ws, {"type": "tool_result", "name": name, "summary": summary})
    return content, is_error


# ---------------------------------------------------------------------------
# Text trickle — re-chunks agent.message blocks into text_delta frames
# ---------------------------------------------------------------------------


async def _trickle_text(ws: WebSocket, text: str) -> None:
    """Emit ``text_delta`` frames in small slices so the UI fills smoothly."""
    for i in range(0, len(text), _TRICKLE_CHUNK):
        await _safe_send(ws, {"type": "text_delta", "content": text[i : i + _TRICKLE_CHUNK]})
        if _TRICKLE_DELAY_S:
            await asyncio.sleep(_TRICKLE_DELAY_S)


__all__ = ["run_qa_turn_managed"]
