"""Investigator — free agent loop that produces a root-cause analysis.

Issue #25 (M4.3). Spawned by Sentinel (#24) when a new work_order lands in
``status='detected'``. Investigates using the 14 MCP data tools + a small
set of local agent-only tools:

- ``render_*`` (M2.9) — generative UI artifacts inline in the chat.
- ``ask_kb_builder`` (M4.6) — dynamic handoff to the KB Builder handler.
- ``submit_rca`` — terminal tool that ends the loop, persists the RCA,
  writes a ``failure_history`` row, and hands off to the Work Order
  Generator (#30).

Safety nets
-----------
- ``MAX_TURNS`` cap on the loop.
- Wall-clock ``asyncio.wait_for`` timeout on the whole run.
- Outer ``try/except`` so a partial failure still leaves the work order
  in ``status='analyzed'`` with a ``rca_summary`` explaining why — the
  operator always sees an outcome, the pipeline never hangs.

Extended thinking (#27) is enabled here via :func:`_llm_call` which wraps
``anthropic.messages.stream()`` with ``thinking={"type": "enabled",
"budget_tokens": 10000}`` and broadcasts each ``thinking_delta`` chunk
as a ``thinking_delta`` WebSocket frame. The frontend Agent Inspector
(M8.5 / #49) renders the live reasoning trace. Signed thinking blocks
are preserved verbatim by ``response.content[*].model_dump()`` so the
next API call (the one carrying ``tool_result`` blocks) does not trip
the ``thinking block signature invalid`` 400 error.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, cast

from agents.anthropic_client import anthropic, model_for
from agents.ui_tools import INVESTIGATOR_RENDER_TOOLS
from agents.work_order_generator import run_work_order_generator
from anthropic.types import Message, ToolUseBlock
from aria_mcp.client import mcp_client
from core.database import db
from core.ws_manager import current_turn_id, ws_manager
from modules.kb.repository import KbRepository
from modules.work_order.repository import WorkOrderRepository

log = logging.getLogger("aria.investigator")

MAX_TURNS = 12
_TIMEOUT_SECONDS = 120.0
# Total output budget. Anthropic requires ``max_tokens > thinking.budget_tokens``
# — keep at least 4096 tokens of headroom above the thinking budget for the
# actual text/tool_use output.
_THINKING_BUDGET = 10000
_MAX_TOKENS = 16384


# ---------------------------------------------------------------------------
# Local agent-only tool schemas
# ---------------------------------------------------------------------------

SUBMIT_RCA_TOOL: dict[str, Any] = {
    "name": "submit_rca",
    "description": (
        "Submit a completed root cause analysis. Call this exactly once, "
        "when you have enough evidence to conclude the investigation. "
        "This ends the agent loop and spawns the Work Order Generator."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "root_cause": {
                "type": "string",
                "description": "Single-sentence conclusion in plain language.",
            },
            "failure_mode": {
                "type": "string",
                "maxLength": 100,
                "description": (
                    "Short machine-friendly classifier for pattern matching "
                    "(e.g. 'bearing_wear', 'cavitation', 'seal_leak'). Max 100 chars."
                ),
            },
            "confidence": {
                "type": "number",
                "minimum": 0,
                "maximum": 1,
                "description": "0.0 to 1.0 — how confident you are in the root cause.",
            },
            "contributing_factors": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Ordered list, most to least significant.",
            },
            "similar_past_failure": {
                "type": ["string", "null"],
                "description": (
                    "Reference a ``failure_history`` entry (id or date label) if "
                    "the current pattern matches a past failure, otherwise null."
                ),
            },
            "recommended_action": {
                "type": "string",
                "description": "What the operator should do next, in one sentence.",
            },
        },
        "required": [
            "root_cause",
            "failure_mode",
            "confidence",
            "contributing_factors",
            "recommended_action",
        ],
    },
}


ASK_KB_BUILDER_TOOL: dict[str, Any] = {
    "name": "ask_kb_builder",
    "description": (
        "Consult the KB Builder for a manufacturer detail absent from the "
        "current knowledge base (e.g. max bolt torque, part reference, "
        "installation spec). Use when the KB lookup you already tried came "
        "back empty and you need a factual value to reason further."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "question": {"type": "string"},
            "cell_id": {"type": "integer"},
        },
        "required": ["question", "cell_id"],
    },
}


INVESTIGATOR_SYSTEM = """You are an industrial maintenance expert agent.

An anomaly has been detected on equipment in production. Investigate freely
using the available tools — you decide what to consult and in what order.

When you have enough evidence, call `submit_rca` with:
- root_cause: single-sentence conclusion
- failure_mode: short classifier (e.g. 'bearing_wear', 'cavitation', 'seal_leak')
- confidence: 0.0-1.0
- contributing_factors: ordered list, most to least significant
- similar_past_failure: reference a past failure if the pattern matches, else null
- recommended_action: one sentence on what the operator should do next

You may also call `render_*` tools to show charts, diagrams and diagnostic
cards inline in the operator's chat, and `ask_kb_builder` to look up a
manufacturer detail missing from the current KB.

Past failures context for this cell:
{past_failures}
"""


# ---------------------------------------------------------------------------
# LLM streaming + extended thinking (#27)
# ---------------------------------------------------------------------------


async def _llm_call(
    *,
    system: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    turn_id: str,
) -> Message:
    """One streamed Investigator turn with extended thinking enabled.

    Wraps ``anthropic.messages.stream(...)`` with
    ``thinking={"type": "enabled", "budget_tokens": _THINKING_BUDGET}`` and
    fans out each ``thinking_delta`` chunk as a ``thinking_delta`` WebSocket
    frame matching ``EventBusMap.thinking_delta`` in
    ``frontend/src/lib/ws.types.ts`` (``{agent, content, turn_id}``).

    The reconstructed final ``Message`` is returned with all content blocks
    intact — including signed ``thinking`` blocks — so the next turn's
    ``messages.append({"role": "assistant", "content": ...})`` preserves
    signatures and avoids the ``thinking block signature invalid`` 400.
    """
    async with anthropic.messages.stream(
        model=model_for("reasoning"),
        thinking={"type": "enabled", "budget_tokens": _THINKING_BUDGET},
        system=system,
        messages=cast(Any, messages),
        tools=cast(Any, tools),
        max_tokens=_MAX_TOKENS,
    ) as stream:
        async for raw_event in stream:
            # The MessageStreamEvent union has many variants; pyright would
            # narrow too aggressively here. Cast to Any since the runtime
            # check (``getattr`` with default) is the safe path anyway.
            event = cast(Any, raw_event)
            if (
                getattr(event, "type", None) == "content_block_delta"
                and getattr(getattr(event, "delta", None), "type", None) == "thinking_delta"
            ):
                # Anthropic SDK exposes the chunk text on ``.thinking``.
                chunk = getattr(event.delta, "thinking", None)
                if chunk:
                    await ws_manager.broadcast(
                        "thinking_delta",
                        {
                            "agent": "investigator",
                            "content": chunk,
                            "turn_id": turn_id,
                        },
                    )
        return await stream.get_final_message()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def run_investigator(work_order_id: int) -> None:
    """Entry point. Wraps the body in a wall-clock timeout + try/except.

    Never raises. On any failure path the work_order is flipped to
    ``status='analyzed'`` with an explanatory ``rca_summary`` and an
    ``rca_ready`` frame is broadcast so the frontend unsticks.
    """
    turn_id = uuid.uuid4().hex
    token = current_turn_id.set(turn_id)
    try:
        await asyncio.wait_for(
            _run_investigator_body(work_order_id, turn_id),
            timeout=_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        log.warning("Investigator timed out for WO %d", work_order_id)
        await _fallback_rca(work_order_id, "Investigation timed out", turn_id)
    except Exception as exc:  # noqa: BLE001 — must never raise, outer asyncio task
        log.exception("Investigator crashed for WO %d", work_order_id)
        await _fallback_rca(work_order_id, f"Investigation failed: {type(exc).__name__}", turn_id)
    finally:
        current_turn_id.reset(token)


# ---------------------------------------------------------------------------
# Loop body
# ---------------------------------------------------------------------------


async def _run_investigator_body(work_order_id: int, turn_id: str) -> None:
    """Load context, run the agent loop until submit_rca or MAX_TURNS."""
    await ws_manager.broadcast("agent_start", {"agent": "investigator", "turn_id": turn_id})

    wo_result = await mcp_client.call_tool("get_work_order", {"work_order_id": work_order_id})
    if wo_result.is_error:
        await _fallback_rca(
            work_order_id, f"get_work_order failed: {wo_result.content[:200]}", turn_id
        )
        return
    try:
        wo_data = json.loads(wo_result.content) if wo_result.content else {}
    except json.JSONDecodeError:
        wo_data = {}
    cell_id = wo_data.get("cell_id")
    if cell_id is None:
        await _fallback_rca(work_order_id, "get_work_order returned no cell_id", turn_id)
        return

    past_result = await mcp_client.call_tool(
        "get_failure_history", {"cell_id": cell_id, "limit": 5}
    )
    past_text = past_result.content if not past_result.is_error else "[]"

    tools_schema: list[dict[str, Any]] = (
        await mcp_client.get_tools_schema()
        + INVESTIGATOR_RENDER_TOOLS
        + [SUBMIT_RCA_TOOL, ASK_KB_BUILDER_TOOL]
    )

    system_prompt = INVESTIGATOR_SYSTEM.format(past_failures=past_text)
    user_text = (
        f"Anomaly detected on cell {cell_id}. "
        f"Work order #{work_order_id}: {wo_data.get('title', '(untitled)')}. "
        "Investigate and submit an RCA."
    )
    messages: list[dict[str, Any]] = [{"role": "user", "content": user_text}]

    finish_reason = "max_turns"
    for _turn in range(MAX_TURNS):
        response = await _llm_call(
            system=system_prompt,
            messages=messages,
            tools=tools_schema,
            turn_id=turn_id,
        )
        # Preserve the full assistant content verbatim — required for
        # signed `thinking` blocks the moment #27 enables thinking. Safe
        # and correct right now too.
        assistant_content = [b.model_dump() for b in response.content]
        messages.append({"role": "assistant", "content": assistant_content})

        tool_uses: list[ToolUseBlock] = [b for b in response.content if isinstance(b, ToolUseBlock)]
        if not tool_uses:
            finish_reason = response.stop_reason or "end_turn"
            break

        tool_results, submitted = await _dispatch_tool_uses(
            tool_uses=tool_uses,
            work_order_id=work_order_id,
            cell_id=cell_id,
            turn_id=turn_id,
        )
        messages.append({"role": "user", "content": tool_results})

        if submitted:
            finish_reason = "submit_rca"
            break

    await ws_manager.broadcast(
        "agent_end",
        {"agent": "investigator", "turn_id": turn_id, "finish_reason": finish_reason},
    )


# ---------------------------------------------------------------------------
# Tool dispatch
# ---------------------------------------------------------------------------


async def _dispatch_tool_uses(
    *,
    tool_uses: list[ToolUseBlock],
    work_order_id: int,
    cell_id: int,
    turn_id: str,
) -> tuple[list[dict[str, Any]], bool]:
    """Run each tool_use and return (tool_results, submitted).

    ``submitted`` is True when one of the tool_uses was ``submit_rca``;
    the caller then breaks the outer loop.
    """
    tool_results: list[dict[str, Any]] = []
    submitted = False

    for tool_use in tool_uses:
        name = tool_use.name
        args = dict(tool_use.input) if isinstance(tool_use.input, dict) else {}

        await ws_manager.broadcast(
            "tool_call_started",
            {"agent": "investigator", "tool_name": name, "args": args, "turn_id": turn_id},
        )
        t0 = time.monotonic()

        try:
            if name.startswith("render_"):
                content, is_error = await _handle_render(name, args, turn_id)
            elif name == "ask_kb_builder":
                content, is_error = await _handle_ask_kb_builder(args, turn_id)
            elif name == "submit_rca":
                content, is_error = await _handle_submit_rca(
                    args=args, work_order_id=work_order_id, cell_id=cell_id, turn_id=turn_id
                )
                submitted = True
            else:
                result = await mcp_client.call_tool(name, args)
                content, is_error = result.content, result.is_error
        except Exception as exc:  # noqa: BLE001 — tool dispatch must never crash the loop
            log.exception("tool_use handler raised for %s", name)
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

        tool_results.append(
            {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": content,
                "is_error": is_error,
            }
        )

    return tool_results, submitted


async def _handle_render(name: str, args: dict[str, Any], turn_id: str) -> tuple[str, bool]:
    """``render_*`` tools: broadcast ``ui_render`` and return 'rendered'.

    The component name passed to the frontend is the tool name minus the
    ``render_`` prefix (e.g. ``render_signal_chart`` -> ``signal_chart``).
    Zero DB or side-effect.
    """
    component = name.removeprefix("render_")
    await ws_manager.broadcast(
        "ui_render",
        {
            "agent": "investigator",
            "component": component,
            "props": args,
            "turn_id": turn_id,
        },
    )
    return "rendered", False


async def _handle_ask_kb_builder(args: dict[str, Any], parent_turn_id: str) -> tuple[str, bool]:
    """Dynamic handoff to ``answer_kb_question`` (M3.5, issue #21).

    Broadcasts ``agent_handoff`` + ``agent_start`` (child turn) +
    ``agent_end`` so the frontend Activity Feed / Agent Inspector shows
    the delegation as a visible sub-turn.
    """
    from agents.kb_builder import answer_kb_question

    question = str(args.get("question", ""))
    try:
        cell_id = int(args.get("cell_id"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return (
            json.dumps({"answer": "cell_id missing or invalid", "source": None, "confidence": 0.0}),
            True,
        )

    await ws_manager.broadcast(
        "agent_handoff",
        {
            "from_agent": "investigator",
            "to_agent": "kb_builder",
            "reason": question,
            "turn_id": parent_turn_id,
        },
    )
    child_turn_id = uuid.uuid4().hex
    await ws_manager.broadcast("agent_start", {"agent": "kb_builder", "turn_id": child_turn_id})
    try:
        answer = await answer_kb_question(cell_id, question)
        is_error = False
    except (
        Exception
    ) as exc:  # noqa: BLE001 — answer_kb_question is never-raising per its contract; defense in depth
        log.warning("ask_kb_builder handoff failed: %s", exc)
        answer = {
            "answer": f"handoff failed: {type(exc).__name__}",
            "source": None,
            "confidence": 0.0,
        }
        is_error = True
    await ws_manager.broadcast(
        "agent_end",
        {
            "agent": "kb_builder",
            "turn_id": child_turn_id,
            "finish_reason": "answered" if not is_error else "error",
        },
    )
    return json.dumps(answer), is_error


async def _handle_submit_rca(
    *, args: dict[str, Any], work_order_id: int, cell_id: int, turn_id: str
) -> tuple[str, bool]:
    """Terminal tool — persist the RCA and spawn the Work Order Generator."""
    rca_summary = str(args.get("root_cause", ""))
    confidence_raw = args.get("confidence", 0.0)
    try:
        confidence = float(confidence_raw)
    except (TypeError, ValueError):
        confidence = 0.0
    failure_mode = str(args.get("failure_mode", "unknown"))[:100]

    async with db.pool.acquire() as conn:
        await WorkOrderRepository(conn).update(
            work_order_id,
            {"rca_summary": rca_summary, "status": "analyzed"},
        )
        await KbRepository(conn).create_failure(
            {
                "cell_id": cell_id,
                "failure_time": _utcnow(),
                "failure_mode": failure_mode,
                "root_cause": rca_summary,
                "work_order_id": work_order_id,
            }
        )

    await ws_manager.broadcast(
        "rca_ready",
        {
            "work_order_id": work_order_id,
            "rca_summary": rca_summary,
            "confidence": confidence,
            "turn_id": turn_id,
        },
    )
    _spawn_work_order_generator(work_order_id)
    return "rca submitted", False


# ---------------------------------------------------------------------------
# Fallback path — timeout, crash, missing context
# ---------------------------------------------------------------------------


async def _fallback_rca(work_order_id: int, reason: str, turn_id: str) -> None:
    """Graceful-degradation path — always leaves the pipeline unstuck.

    Flips the work_order to ``status='analyzed'`` with the failure
    reason as its ``rca_summary`` so the operator sees *something* in
    the UI. Broadcasts ``rca_ready`` with ``confidence=0.0`` so the
    Activity Feed / Inspector transition to the done state.
    """
    try:
        async with db.pool.acquire() as conn:
            await WorkOrderRepository(conn).update(
                work_order_id, {"rca_summary": reason, "status": "analyzed"}
            )
    except Exception:  # noqa: BLE001 — best effort, never raise from fallback
        log.exception("fallback_rca DB update failed for WO %d", work_order_id)

    await ws_manager.broadcast(
        "rca_ready",
        {
            "work_order_id": work_order_id,
            "rca_summary": reason,
            "confidence": 0.0,
            "turn_id": turn_id,
        },
    )
    await ws_manager.broadcast(
        "agent_end",
        {"agent": "investigator", "turn_id": turn_id, "finish_reason": "error"},
    )


# ---------------------------------------------------------------------------
# Work Order Generator spawn
# ---------------------------------------------------------------------------


def _spawn_work_order_generator(work_order_id: int) -> None:
    """Kick off the Work Order Generator (#30) in the background."""
    asyncio.create_task(
        run_work_order_generator(work_order_id),
        name=f"work-order-gen-wo-{work_order_id}",
    )


# ---------------------------------------------------------------------------
# Small helpers kept private so tests can monkeypatch them.
# ---------------------------------------------------------------------------


def _utcnow():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc)


__all__ = [
    "ASK_KB_BUILDER_TOOL",
    "INVESTIGATOR_SYSTEM",
    "MAX_TURNS",
    "SUBMIT_RCA_TOOL",
    "run_investigator",
]
