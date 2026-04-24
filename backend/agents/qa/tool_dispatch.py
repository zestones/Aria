"""Shared Q&A tool-dispatch helpers.

These handlers are consumed by BOTH the Messages API path
(:mod:`agents.qa.messages_api`) and the Managed Agents path
(:mod:`agents.qa.managed`), so they live in one place and are
imported by both drivers.

- :func:`handle_render` — fan out a ``render_*`` call on BOTH the events
  bus and the chat channel (dual-channel broadcast contract).
- :func:`handle_ask_investigator` — dynamic handoff to
  :func:`agents.qa.investigator_qa.answer_investigator_question`, emits
  ``agent_handoff`` on both channels plus a nested
  ``agent_start``/``agent_end`` sub-turn.
- :func:`summarise_tool_result` — short chat-channel ``tool_result`` summary.
- :func:`safe_send` — WebSocket send wrapper that swallows
  closed-socket errors so the agent loop can finish cleanly.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from agents.qa import investigator_qa
from core.ws_manager import ws_manager
from fastapi import WebSocket

log = logging.getLogger("aria.qa_agent")


async def handle_render(
    ws: WebSocket, name: str, args: dict[str, Any], turn_id: str
) -> tuple[str, bool]:
    """``render_*`` tools — fan out on BOTH events bus + chat channel."""
    component = name.removeprefix("render_")
    await ws_manager.broadcast(
        "ui_render",
        {
            "agent": "qa",
            "component": component,
            "props": args,
            "turn_id": turn_id,
        },
    )
    await safe_send(ws, {"type": "ui_render", "component": component, "props": args})
    return "rendered", False


async def handle_ask_investigator(
    ws: WebSocket, args: dict[str, Any], parent_turn_id: str
) -> tuple[str, bool]:
    """Dynamic handoff to :func:`answer_investigator_question`.

    Emits ``agent_handoff`` on the **events bus** with the underscored
    shape (``from_agent``/``to_agent``) AND on the **chat channel** with
    the unprefixed shape (``from``/``to``). Per-channel field naming
    mirrors ``ChatMap.agent_handoff`` vs ``EventBusMap.agent_handoff``.
    """
    question = str(args.get("question", ""))
    try:
        cell_id = int(args.get("cell_id"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return (
            json.dumps(
                {
                    "answer": "cell_id missing or invalid",
                    "cited_work_order_ids": [],
                    "cited_failure_ids": [],
                    "confidence": 0.0,
                }
            ),
            True,
        )

    await ws_manager.broadcast(
        "agent_handoff",
        {
            "from_agent": "qa",
            "to_agent": "investigator",
            "reason": question,
            "turn_id": parent_turn_id,
        },
    )
    await safe_send(
        ws,
        {
            "type": "agent_handoff",
            "from": "qa",
            "to": "investigator",
            "reason": question,
        },
    )
    child_turn_id = uuid.uuid4().hex
    # Issue #125: forward the sub-agent agent_start on the chat socket too,
    # so the M8.5 Agent Inspector can correlate the chat badge with the
    # /api/v1/events thinking_delta stream (filtered by agent name + turn_id).
    # The events-bus broadcast contract is unchanged.
    await ws_manager.broadcast("agent_start", {"agent": "investigator", "turn_id": child_turn_id})
    await safe_send(
        ws,
        {"type": "agent_start", "agent": "investigator", "turn_id": child_turn_id},
    )
    try:
        # Resolved via the module so ``monkeypatch.setattr(investigator_qa,
        # "answer_investigator_question", ...)`` in tests takes effect.
        answer = await investigator_qa.answer_investigator_question(cell_id, question)
        is_error = False
    except (
        Exception
    ) as exc:  # noqa: BLE001 — defense-in-depth, answer_investigator_question is never-raising
        log.warning("ask_investigator handoff failed: %s", exc)
        answer = {
            "answer": f"handoff failed: {type(exc).__name__}",
            "cited_work_order_ids": [],
            "cited_failure_ids": [],
            "confidence": 0.0,
        }
        is_error = True
    finish_reason = "answered" if not is_error else "error"
    await ws_manager.broadcast(
        "agent_end",
        {
            "agent": "investigator",
            "turn_id": child_turn_id,
            "finish_reason": finish_reason,
        },
    )
    # Issue #125: mirror agent_end on the chat socket. ChatMap currently has
    # no agent_end variant — the frontend chatStore switch ignores unknown
    # types, so this is a forward-compatible no-op until the inspector wires
    # the end signal in. Sending it now closes the contract gap server-side.
    await safe_send(
        ws,
        {
            "type": "agent_end",
            "agent": "investigator",
            "turn_id": child_turn_id,
            "finish_reason": finish_reason,
        },
    )
    return json.dumps(answer), is_error


def summarise_tool_result(name: str, content: str, is_error: bool) -> str:
    """Produce the short string that goes in ``ChatMap.tool_result.summary``.

    The chat channel contract forbids shipping raw tool JSON — frontend
    renders this summary inline in a collapsable card. Keep it compact;
    the expandable card pulls raw content from the per-turn state if
    needed.
    """
    if is_error:
        return f"{name} failed"
    try:
        data = json.loads(content)
    except (ValueError, TypeError):
        return content[:120] if content else f"{name} returned no content"
    if isinstance(data, list):
        return f"{name} returned {len(data)} row(s)"
    if isinstance(data, dict):
        keys = list(data.keys())[:5]
        return f"{name} returned {{{', '.join(keys)}}}"
    return str(data)[:120]


async def safe_send(ws: WebSocket, frame: dict[str, Any]) -> None:
    """Send a JSON frame, swallowing ``RuntimeError`` from closed sockets.

    The chat WS is per-connection and the client can drop mid-stream; we
    must not propagate that into the agent loop (which would tear the
    ``current_turn_id`` ContextVar before ``agent_end`` fires).
    """
    try:
        await ws.send_json(frame)
    except Exception:  # noqa: BLE001 — disconnected socket; caller recovers on next receive
        log.debug("qa ws send failed — socket likely closed")
