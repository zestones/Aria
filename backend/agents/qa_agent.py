"""Q&A agent — streams a maintenance-assistant chat over ``WS /api/v1/agent/chat``.

Issue #31 (M5.2). One module, two public entry points:

- :func:`run_qa_turn` — runs one user-input → agent loop → ``done`` cycle
  against a per-connection ``messages`` list, streaming ``text_delta``,
  ``tool_call``, ``tool_result``, ``ui_render``, ``agent_handoff`` and
  finally ``done`` frames to the client WebSocket.
- :func:`answer_investigator_question` — short deterministic diagnostic
  handler used by :data:`ASK_INVESTIGATOR_TOOL`. Mirrors
  :func:`agents.kb_builder.qa.answer_kb_question` (M3.5 / #21): pure,
  no WS broadcasts, no DB writes, never raises.

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

import json
import logging
import time
import uuid
from typing import Any, cast

from agents.anthropic_client import anthropic, model_for, parse_json_response
from agents.ui_tools import QA_RENDER_TOOLS
from anthropic.types import ToolUseBlock
from aria_mcp.client import mcp_client
from core.database import db
from core.ws_manager import current_turn_id, ws_manager
from fastapi import WebSocket

log = logging.getLogger("aria.qa_agent")

_MAX_TOKENS = 4096
_MAX_TURNS_PER_USER_INPUT = 8


# ---------------------------------------------------------------------------
# Local agent-only tools
# ---------------------------------------------------------------------------


ASK_INVESTIGATOR_TOOL: dict[str, Any] = {
    "name": "ask_investigator",
    "description": (
        "Consult the Investigator agent for a diagnostic analysis when the user "
        "asks about an anomaly, root cause, or why something failed. Returns an "
        "RCA summary with cited evidence (recent work orders + past failures). "
        "Use this instead of answering from raw signals when the question "
        "implies causation ('why did X trip', 'what caused Y'). Do NOT use for "
        "simple data lookups — use the MCP signal / KPI / logbook tools directly."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "cell_id": {"type": "integer"},
            "question": {"type": "string"},
        },
        "required": ["cell_id", "question"],
    },
}


QA_SYSTEM = """You are ARIA, a maintenance assistant agent.

Answer operator questions about their equipment using the available tools.

Guidance:
- Prefer concise answers backed by data. Cite sources (KB, logbook, signals,
  past RCAs) whenever you use them.
- For "why did X fail" / "what caused Y" questions, call `ask_investigator`
  with the relevant cell_id — that handler reads recent RCAs and past
  failures on your behalf.
- For data lookups (OEE, MTBF, signal values, logbook entries, work orders)
  call the MCP tools directly.
- You can render inline charts and cards with `render_*` tools when a
  visual is clearer than text.
- Respond in the language of the operator's question. Default to French if
  the request is ambiguous.
"""


# ---------------------------------------------------------------------------
# answer_investigator_question — abbreviated diagnostic handler
# ---------------------------------------------------------------------------


_INVESTIGATOR_QA_SYSTEM = (
    "You answer a diagnostic question on behalf of the Investigator agent. "
    "Use the recent work orders and past failures provided below. If the "
    "information is missing, say so — do not speculate. "
    "Response format: JSON object with keys: answer (str, one short paragraph), "
    "cited_work_order_ids (list[int]), cited_failure_ids (list[int]), "
    "confidence (0.0-1.0)."
)


async def answer_investigator_question(cell_id: int, question: str) -> dict[str, Any]:
    """Answer a diagnostic question from the Q&A agent.

    Short deterministic path — does NOT spawn a full ``run_investigator``
    run. Reads recent work orders with an RCA and past failures for the
    cell, asks Sonnet to answer in JSON. Mirrors
    :func:`agents.kb_builder.qa.answer_kb_question` contract:

    - Returns a dict on every path. Never raises.
    - No WS broadcasts, no DB writes (caller owns handoff frames).
    - Always Sonnet — ``ARIA_MODEL=opus`` must not 10x the cost of a
      simple lookup.

    Returned dict shape
    -------------------
    ``{"answer": str, "cited_work_order_ids": list[int],
       "cited_failure_ids": list[int], "confidence": float}``
    """
    try:
        context = await _collect_diagnostic_context(cell_id)
    except Exception as exc:  # noqa: BLE001 — safe fallback for the tool loop
        log.warning("ask_investigator context load failed for cell %d: %s", cell_id, exc)
        return {
            "answer": f"Diagnostic context unavailable for cell {cell_id}.",
            "cited_work_order_ids": [],
            "cited_failure_ids": [],
            "confidence": 0.0,
        }

    try:
        response = await anthropic.messages.create(
            model=model_for("chat"),
            max_tokens=1024,
            system=_INVESTIGATOR_QA_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Recent work orders for cell {cell_id}:\n"
                        f"{json.dumps(context['work_orders'], default=str)}\n\n"
                        f"Past failures for cell {cell_id}:\n"
                        f"{json.dumps(context['failures'], default=str)}\n\n"
                        f"Question: {question}"
                    ),
                }
            ],
        )
        parsed = parse_json_response(response)
    except Exception as exc:  # noqa: BLE001 — safe fallback for the tool loop
        log.warning("ask_investigator LLM call failed for cell %d: %s", cell_id, exc)
        return {
            "answer": "Diagnostic query failed — information unavailable.",
            "cited_work_order_ids": [],
            "cited_failure_ids": [],
            "confidence": 0.0,
        }

    # Best-effort normalisation — the LLM may skip optional fields.
    return {
        "answer": str(parsed.get("answer") or ""),
        "cited_work_order_ids": list(parsed.get("cited_work_order_ids") or []),
        "cited_failure_ids": list(parsed.get("cited_failure_ids") or []),
        "confidence": float(parsed.get("confidence") or 0.0),
    }


async def _collect_diagnostic_context(cell_id: int) -> dict[str, Any]:
    """Pull a small window of recent RCAs + past failures for the cell."""
    async with db.pool.acquire() as conn:
        wo_rows = await conn.fetch(
            """
            SELECT id, status, priority, title, rca_summary, created_at
              FROM work_order
             WHERE cell_id = $1 AND rca_summary IS NOT NULL
             ORDER BY created_at DESC
             LIMIT 5
            """,
            cell_id,
        )
        fh_rows = await conn.fetch(
            """
            SELECT id, failure_time, failure_mode, root_cause
              FROM failure_history
             WHERE cell_id = $1
             ORDER BY failure_time DESC
             LIMIT 5
            """,
            cell_id,
        )
    return {
        "work_orders": [dict(r) for r in wo_rows],
        "failures": [dict(r) for r in fh_rows],
    }


# ---------------------------------------------------------------------------
# Orchestrator — one user input, possibly many LLM turns, terminates with `done`
# ---------------------------------------------------------------------------


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
        await _safe_send(ws, {"type": "done", "error": "empty message"})
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

            tool_results = await _dispatch_tool_uses(
                ws=ws, tool_uses=tool_uses, turn_id=turn_id
            )
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
    await _safe_send(ws, done_frame)


# ---------------------------------------------------------------------------
# One LLM turn — streams text_delta to the client, returns tool_uses + full content
# ---------------------------------------------------------------------------


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
                    await _safe_send(ws, {"type": "text_delta", "content": chunk})
        final_message = await stream.get_final_message()

    tool_uses: list[ToolUseBlock] = [
        b for b in final_message.content if isinstance(b, ToolUseBlock)
    ]
    assistant_content = [b.model_dump() for b in final_message.content]
    _ = turn_id  # reserved for future tool_call_started streaming extensions
    return tool_uses, assistant_content


# ---------------------------------------------------------------------------
# Tool dispatch — render_* / ask_investigator / MCP tools
# ---------------------------------------------------------------------------


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

        summary = _summarise_tool_result(name, content, is_error)
        await _safe_send(ws, {"type": "tool_result", "name": name, "summary": summary})

        results.append(
            {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": content,
                "is_error": is_error,
            }
        )

    return results


async def _handle_render(
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
    await _safe_send(ws, {"type": "ui_render", "component": component, "props": args})
    return "rendered", False


async def _handle_ask_investigator(
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
    await _safe_send(
        ws,
        {
            "type": "agent_handoff",
            "from": "qa",
            "to": "investigator",
            "reason": question,
        },
    )
    child_turn_id = uuid.uuid4().hex
    await ws_manager.broadcast(
        "agent_start", {"agent": "investigator", "turn_id": child_turn_id}
    )
    try:
        answer = await answer_investigator_question(cell_id, question)
        is_error = False
    except Exception as exc:  # noqa: BLE001 — defense-in-depth, answer_investigator_question is never-raising
        log.warning("ask_investigator handoff failed: %s", exc)
        answer = {
            "answer": f"handoff failed: {type(exc).__name__}",
            "cited_work_order_ids": [],
            "cited_failure_ids": [],
            "confidence": 0.0,
        }
        is_error = True
    await ws_manager.broadcast(
        "agent_end",
        {
            "agent": "investigator",
            "turn_id": child_turn_id,
            "finish_reason": "answered" if not is_error else "error",
        },
    )
    return json.dumps(answer), is_error


def _summarise_tool_result(name: str, content: str, is_error: bool) -> str:
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


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


async def _safe_send(ws: WebSocket, frame: dict[str, Any]) -> None:
    """Send a JSON frame, swallowing ``RuntimeError`` from closed sockets.

    The chat WS is per-connection and the client can drop mid-stream; we
    must not propagate that into the agent loop (which would tear the
    ``current_turn_id`` ContextVar before ``agent_end`` fires).
    """
    try:
        await ws.send_json(frame)
    except Exception:  # noqa: BLE001 — disconnected socket; caller recovers on next receive
        log.debug("qa ws send failed — socket likely closed")


__all__ = [
    "ASK_INVESTIGATOR_TOOL",
    "QA_SYSTEM",
    "answer_investigator_question",
    "run_qa_turn",
]
