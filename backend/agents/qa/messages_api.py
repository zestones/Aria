"""Q&A Messages API agent loop (#31 / M5.2).

:func:`run_qa_turn` drives one user-input → agent loop → ``done`` cycle
against a per-connection ``messages`` list, streaming ``text_delta``,
``tool_call``, ``tool_result``, ``ui_render``, ``agent_handoff`` and
finally ``done`` frames to the client WebSocket.

Design notes
------------
- Model is always Sonnet (``model_for("chat")``). Q&A is interactive and
  cost-sensitive — Opus for free-text would 10x the bill without a
  measurable answer-quality gain on the demo corpus.
- Extended thinking is NOT enabled — see #27 for the Investigator-only
  policy. ``ChatMap.thinking_delta`` exists in the frontend contract so
  #33 Managed Agents can flip it on later without a type bump.
- The router (``modules/chat/router.py``) owns the per-connection state
  (``messages: list``, auth payload) and hands off to :func:`run_qa_turn`
  for each inbound user message. That keeps this module pure async
  functions and makes it trivially mockable.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any, cast

from agents.anthropic_client import anthropic, model_for
from agents.qa import tool_dispatch
from agents.qa.schemas import ASK_INVESTIGATOR_TOOL
from agents.qa.tool_dispatch import safe_send, summarise_tool_result
from agents.ui_tools import QA_RENDER_TOOLS
from anthropic.types import ToolUseBlock
from aria_mcp.client import mcp_client
from core.ws_manager import current_turn_id, ws_manager
from fastapi import WebSocket

from agents.qa.prompts import QA_SYSTEM

log = logging.getLogger("aria.qa_agent")

_MAX_TOKENS = 4096
_MAX_TURNS_PER_USER_INPUT = 8


async def run_qa_turn(
    *,
    ws: WebSocket,
    messages: list[dict[str, Any]],
    user_content: str,
) -> None:
    """Drive one agent cycle to completion: user → (LLM + tools)* → done.

    Appends the user message to ``messages``, then loops LLM calls until
    no tool_use blocks come back (or a turn budget is hit). Every frame
    emitted to the client matches the ``ChatMap`` discriminated union in
    ``frontend/src/lib/ws.types.ts``.
    """
    if not user_content.strip():
        await safe_send(ws, {"type": "done", "error": "empty message"})
        return

    messages.append({"role": "user", "content": user_content})

    turn_id = uuid.uuid4().hex
    token = current_turn_id.set(turn_id)
    await ws_manager.broadcast("agent_start", {"agent": "qa", "turn_id": turn_id})

    finish_reason = "max_turns"
    error: str | None = None
    try:
        for _turn in range(_MAX_TURNS_PER_USER_INPUT):
            tool_uses, assistant_content = await _stream_one_turn(
                ws=ws, messages=messages, turn_id=turn_id
            )
            messages.append({"role": "assistant", "content": assistant_content})

            if not tool_uses:
                finish_reason = "end_turn"
                break

            tool_results = await _dispatch_tool_uses(ws=ws, tool_uses=tool_uses, turn_id=turn_id)
            messages.append({"role": "user", "content": tool_results})
    except Exception as exc:  # noqa: BLE001 — never let one bad turn take the WS down
        log.exception("qa turn crashed")
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
    await safe_send(ws, done_frame)


async def _stream_one_turn(
    *,
    ws: WebSocket,
    messages: list[dict[str, Any]],
    turn_id: str,
) -> tuple[list[ToolUseBlock], list[dict[str, Any]]]:
    """One ``anthropic.messages.stream`` call — stream deltas, return final blocks."""
    tools_schema: list[dict[str, Any]] = (
        await mcp_client.get_tools_schema() + QA_RENDER_TOOLS + [ASK_INVESTIGATOR_TOOL]
    )

    async with anthropic.messages.stream(
        model=model_for("chat"),
        system=QA_SYSTEM,
        messages=cast(Any, messages),
        tools=cast(Any, tools_schema),
        max_tokens=_MAX_TOKENS,
    ) as stream:
        async for raw_event in stream:
            event = cast(Any, raw_event)
            # Stream only text_delta. Input/output JSON deltas (tool arg
            # streaming) are aggregated into the final block via
            # `stream.get_final_message`.
            if (
                getattr(event, "type", None) == "content_block_delta"
                and getattr(getattr(event, "delta", None), "type", None) == "text_delta"
            ):
                chunk = getattr(event.delta, "text", None)
                if chunk:
                    await safe_send(ws, {"type": "text_delta", "content": chunk})
        final_message = await stream.get_final_message()

    tool_uses: list[ToolUseBlock] = [
        b for b in final_message.content if isinstance(b, ToolUseBlock)
    ]
    assistant_content = [
        b.model_dump(exclude_none=True, exclude={"parsed_output"}) for b in final_message.content
    ]
    _ = turn_id  # reserved for future tool_call_started streaming extensions
    return tool_uses, assistant_content


async def _dispatch_tool_uses(
    *,
    ws: WebSocket,
    tool_uses: list[ToolUseBlock],
    turn_id: str,
) -> list[dict[str, Any]]:
    """Run each tool_use and return a list of ``tool_result`` blocks for the LLM."""
    results: list[dict[str, Any]] = []
    for tool_use in tool_uses:
        name = tool_use.name
        args = dict(tool_use.input) if isinstance(tool_use.input, dict) else {}

        await ws_manager.broadcast(
            "tool_call_started",
            {"agent": "qa", "tool_name": name, "args": args, "turn_id": turn_id},
        )
        await safe_send(ws, {"type": "tool_call", "name": name, "args": args})
        t0 = time.monotonic()

        try:
            if name.startswith("render_"):
                content, is_error = await tool_dispatch.handle_render(ws, name, args, turn_id)
            elif name == "ask_investigator":
                content, is_error = await tool_dispatch.handle_ask_investigator(ws, args, turn_id)
            else:
                result = await mcp_client.call_tool(name, args)
                content, is_error = result.content, result.is_error
        except Exception as exc:  # noqa: BLE001 — tool dispatch must never crash the loop
            log.exception("qa tool_use handler raised for %s", name)
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

        summary = summarise_tool_result(name, content, is_error)
        await safe_send(ws, {"type": "tool_result", "name": name, "summary": summary})

        results.append(
            {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": content,
                "is_error": is_error,
            }
        )

    return results
