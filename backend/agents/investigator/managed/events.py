"""Stream event loop for the managed Investigator (#103 / M5.5).

One public coroutine: :func:`drive_session_events`. Opens
``client.beta.sessions.events.stream(session_id)`` as an async context
manager, sends the initial ``user.message``, then iterates events and
branches on ``event.type``:

- ``agent.thinking`` — broadcast one ``EventBusMap.thinking_delta``
  frame per reasoning block (no per-chunk granularity — Managed Agents
  emits whole thinking events, not deltas).
- ``agent.custom_tool_use`` — buffer by id until the session idles.
- ``session.status_idle`` — branch on ``stop_reason.type``:

  - ``end_turn`` — investigation done; return whether any pending batch
    already resolved a ``submit_rca``.
  - ``requires_action`` — hand off to :func:`tool_dispatch.resolve_pending_tools`
    to run each pending custom tool and send back the
    ``user.custom_tool_result``.
  - ``retries_exhausted`` — raise; caller routes to
    :func:`agents.investigator.service.fallback_rca`.

- ``session.status_terminated`` / ``session.error`` — raise; caller
  routes to fallback.
- Everything else (``agent.message``, ``agent.tool_use``,
  ``agent.mcp_tool_use``, thread-context events) is informational and
  ignored here — the reasoning trace lands in ``agent.thinking``, the
  final answer lands in the ``submit_rca`` custom-tool call.
"""

from __future__ import annotations

import logging
from typing import Any, cast

from agents.anthropic_client import anthropic
from agents.investigator.managed.tool_dispatch import resolve_pending_tools
from core.config import get_settings
from core.ws_manager import ws_manager

log = logging.getLogger("aria.investigator.managed.events")


async def drive_session_events(
    *,
    session_id: str,
    work_order_id: int,
    cell_id: int,
    turn_id: str,
    user_text: str,
) -> bool:
    """Open the stream, send ``user.message``, dispatch tools until done.

    Returns ``True`` when the agent called ``submit_rca`` at least once.
    Raises on ``session.error`` / ``session.status_terminated`` /
    ``retries_exhausted`` — the outer ``run_investigator_managed``
    catches and routes to fallback.
    """
    beta = get_settings().managed_agents_beta
    # event_id -> (tool_name, input_args) — buffered so requires_action
    # can look them up by id.
    pending: dict[str, tuple[str, dict[str, Any]]] = {}
    submitted = False

    stream_cm = await anthropic.beta.sessions.events.stream(session_id, betas=cast(Any, [beta]))
    async with stream_cm as stream:
        await anthropic.beta.sessions.events.send(
            session_id,
            events=cast(
                Any,
                [
                    {
                        "type": "user.message",
                        "content": [{"type": "text", "text": user_text}],
                    }
                ],
            ),
            betas=cast(Any, [beta]),
        )

        async for raw_event in stream:
            event = cast(Any, raw_event)
            etype = getattr(event, "type", None)

            if etype == "agent.thinking":
                chunk = getattr(event, "thinking", None)
                if chunk:
                    await ws_manager.broadcast(
                        "thinking_delta",
                        {
                            "agent": "investigator",
                            "content": chunk,
                            "turn_id": turn_id,
                        },
                    )
                continue

            if etype == "agent.custom_tool_use":
                tu_id = getattr(event, "id", None)
                tu_input = getattr(event, "input", {}) or {}
                if tu_id:
                    pending[tu_id] = (
                        getattr(event, "name", ""),
                        dict(tu_input) if isinstance(tu_input, dict) else {},
                    )
                continue

            if etype == "session.status_idle":
                stop_reason = getattr(event, "stop_reason", None)
                stop_type = getattr(stop_reason, "type", None)

                if stop_type == "end_turn":
                    return submitted
                if stop_type == "retries_exhausted":
                    raise RuntimeError("managed agents retries exhausted")
                if stop_type == "requires_action":
                    event_ids = list(getattr(stop_reason, "event_ids", []) or [])
                    submitted_in_batch = await resolve_pending_tools(
                        session_id=session_id,
                        event_ids=event_ids,
                        pending=pending,
                        work_order_id=work_order_id,
                        cell_id=cell_id,
                        turn_id=turn_id,
                        beta=beta,
                    )
                    submitted = submitted or submitted_in_batch
                    continue
                # Unknown idle reasons: keep iterating; next events will
                # clarify or the stream will close.
                continue

            if etype == "session.status_terminated":
                raise RuntimeError("managed agents session terminated")

            if etype == "session.error":
                err = getattr(event, "error", None)
                raise RuntimeError(f"managed agents session error: {err!r}")

            # Everything else (agent.message / agent.tool_use /
            # agent.mcp_tool_use / agent.mcp_tool_result / thread-context
            # events) is informational — no backend action required.
            continue

    return submitted
