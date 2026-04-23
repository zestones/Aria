"""Custom-tool dispatch for the managed Investigator (#103 / M5.5).

When the Managed Agents session idles with ``stop_reason.type ==
"requires_action"``, the event stream gives us a list of
``agent.custom_tool_use`` event ids to resolve. This module buffers the
lookup (caller passes the name/input map) and:

1. Fans out the usual ``tool_call_started`` / ``tool_call_completed``
   event-bus broadcasts so the Inspector UI stays informed.
2. Routes each call to the existing handler in
   :mod:`agents.investigator.service` (``handle_render`` /
   ``handle_submit_rca``) or :mod:`agents.investigator.handoff`
   (``handle_ask_kb_builder``) — zero duplicated dispatch logic.
3. Sends the matching ``user.custom_tool_result`` event back to the
   session so Anthropic can continue reasoning.

Returns a boolean to the caller indicating whether ``submit_rca`` was
one of the tools resolved in this batch — the loop uses that to decide
whether the investigation is "done" on the next ``end_turn``.
"""

from __future__ import annotations

import logging
import time
from typing import Any, cast

from agents.anthropic_client import anthropic
from agents.investigator import handoff, service
from core.ws_manager import ws_manager

log = logging.getLogger("aria.investigator.managed.tool_dispatch")


async def resolve_pending_tools(
    *,
    session_id: str,
    event_ids: list[str],
    pending: dict[str, tuple[str, dict[str, Any]]],
    work_order_id: int,
    cell_id: int,
    turn_id: str,
    beta: str,
) -> bool:
    """Dispatch each requested custom tool and send its result back.

    Returns ``True`` when ``submit_rca`` was called in this batch.
    """
    submitted_here = False
    for event_id in event_ids:
        entry = pending.pop(event_id, None)
        if entry is None:
            # Event id was NOT one of our buffered ``agent.custom_tool_use``
            # events — almost always a hosted-MCP tool call (the managed
            # API resolves those itself). Silently skip rather than try to
            # post a ``user.custom_tool_result`` that would 400 with
            # "tool_use_id ... does not match any custom_tool_use event".
            log.debug("skipping non-custom event %s in requires_action batch", event_id)
            continue

        name, args = entry
        content, is_error, called_submit = await _dispatch_custom_tool(
            name=name,
            args=args,
            work_order_id=work_order_id,
            cell_id=cell_id,
            turn_id=turn_id,
            session_id=session_id,
        )
        submitted_here = submitted_here or called_submit

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

    return submitted_here


async def _dispatch_custom_tool(
    *,
    name: str,
    args: dict[str, Any],
    work_order_id: int,
    cell_id: int,
    turn_id: str,
    session_id: str,
) -> tuple[str, bool, bool]:
    """Run one custom tool. Returns (content, is_error, called_submit_rca)."""
    await ws_manager.broadcast(
        "tool_call_started",
        {"agent": "investigator", "tool_name": name, "args": args, "turn_id": turn_id},
    )
    t0 = time.monotonic()
    called_submit = False

    try:
        if name.startswith("render_"):
            content, is_error = await service.handle_render(name, args, turn_id)
        elif name == "ask_kb_builder":
            content, is_error = await handoff.handle_ask_kb_builder(args, turn_id)
        elif name == "submit_rca":
            content, is_error = await service.handle_submit_rca(
                args=args,
                work_order_id=work_order_id,
                cell_id=cell_id,
                turn_id=turn_id,
                session_id=session_id,
            )
            called_submit = True
        else:
            content = f"unknown custom tool {name!r}"
            is_error = True
    except Exception as exc:  # noqa: BLE001 — tool dispatch must never crash the loop
        log.exception("managed investigator tool handler raised for %s", name)
        content = f"handler raised {type(exc).__name__}: {exc}"
        is_error = True

    duration_ms = int((time.monotonic() - t0) * 1000)
    await ws_manager.broadcast(
        "tool_call_completed",
        {
            "agent": "investigator",
            "tool_name": name,
            "duration_ms": duration_ms,
            "turn_id": turn_id,
        },
    )
    return str(content), is_error, called_submit
