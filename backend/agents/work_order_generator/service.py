"""Work Order Generator loop (#30 / M5.1).

Turns an RCA into an actionable work order. Spawned by the Investigator
(#25) as soon as it calls ``submit_rca`` successfully. Short agent loop
— typically 2 tool calls: ``get_equipment_kb`` to read the equipment's
procedures + parts list, then ``submit_work_order`` to write the final
structured work order.

- Safety nets mirror the Investigator (wall-clock timeout, MAX_TURNS,
  outer ``try/except``), with tighter bounds because the loop is expected
  to terminate in 1–2 turns.
- Extended thinking is NOT enabled here. The Investigator is the only
  agent that consumes it (per #27) — WO Gen output is a structured JSON
  blob, no multi-step reasoning benefit.
- Failure path leaves the work order at ``status='analyzed'`` with its
  existing ``rca_summary`` intact. Operator can hit the "Regenerate" UI
  action (frontend) to retry — no ``work_order_ready`` is broadcast on
  failure so the frontend will not render an empty Work Order Card.

Contract with Investigator: Investigator's ``spawn_work_order_generator``
imports ``run_work_order_generator`` from this module, so the moment
this module is importable the pipeline starts routing end-to-end.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime
from typing import Any, cast

from agents.anthropic_client import anthropic, model_for
from agents.ui_tools import WORK_ORDER_GEN_RENDER_TOOLS
from agents.work_order_generator.prompts import WO_GEN_SYSTEM
from agents.work_order_generator.schemas import SUBMIT_WORK_ORDER_TOOL
from anthropic.types import ToolUseBlock
from aria_mcp.client import mcp_client
from core.database import db
from core.ws_manager import current_turn_id, ws_manager
from modules.work_order.repository import WorkOrderRepository

log = logging.getLogger("aria.work_order_generator")

MAX_TURNS = 6
_TIMEOUT_SECONDS = 60.0
_MAX_TOKENS = 4096


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def run_work_order_generator(work_order_id: int) -> None:
    """Entry point. Wall-clock timeout + try/except wrapper.

    Never raises. On timeout or crash the work order stays in
    ``status='analyzed'`` so the operator can trigger a manual retry from
    the frontend. ``work_order_ready`` is NOT broadcast in that case —
    the frontend should keep showing the RCA-only state.
    """
    turn_id = uuid.uuid4().hex
    token = current_turn_id.set(turn_id)
    try:
        await asyncio.wait_for(
            _run_body(work_order_id, turn_id),
            timeout=_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        log.warning("Work Order Generator timed out for WO %d", work_order_id)
        await _fail_end(turn_id, "timeout")
    except Exception as exc:  # noqa: BLE001 — outer asyncio task must never raise
        log.exception("Work Order Generator crashed for WO %d", work_order_id)
        await _fail_end(turn_id, f"error: {type(exc).__name__}")
    finally:
        current_turn_id.reset(token)


# ---------------------------------------------------------------------------
# Loop body
# ---------------------------------------------------------------------------


async def _run_body(work_order_id: int, turn_id: str) -> None:
    """Load context, run the agent loop until ``submit_work_order`` or MAX_TURNS."""
    await ws_manager.broadcast("agent_start", {"agent": "work_order_generator", "turn_id": turn_id})

    wo_result = await mcp_client.call_tool("get_work_order", {"work_order_id": work_order_id})
    if wo_result.is_error:
        log.warning("get_work_order failed for WO %d: %s", work_order_id, wo_result.content[:200])
        await _fail_end(turn_id, "get_work_order failed")
        return
    try:
        wo_data = json.loads(wo_result.content) if wo_result.content else {}
    except json.JSONDecodeError:
        wo_data = {}
    cell_id = wo_data.get("cell_id")
    if cell_id is None:
        await _fail_end(turn_id, "no cell_id on work_order")
        return

    tools_schema: list[dict[str, Any]] = (
        await mcp_client.get_tools_schema() + WORK_ORDER_GEN_RENDER_TOOLS + [SUBMIT_WORK_ORDER_TOOL]
    )

    system_prompt = WO_GEN_SYSTEM.format(
        rca_summary=wo_data.get("rca_summary") or "(no RCA summary available)",
        work_order_id=work_order_id,
        cell_id=cell_id,
        current_title=wo_data.get("title") or "(untitled)",
    )
    user_text = (
        "Generate an actionable work order for the technician. "
        "Read the equipment KB for standard procedures and parts, then call "
        "submit_work_order exactly once with the completed package."
    )
    messages: list[dict[str, Any]] = [{"role": "user", "content": user_text}]

    finish_reason = "max_turns"
    submitted_args: dict[str, Any] | None = None

    for _turn in range(MAX_TURNS):
        response = await anthropic.messages.create(
            model=model_for("reasoning"),
            system=system_prompt,
            messages=cast(Any, messages),
            tools=cast(Any, tools_schema),
            max_tokens=_MAX_TOKENS,
        )
        assistant_content = [b.model_dump() for b in response.content]
        messages.append({"role": "assistant", "content": assistant_content})

        tool_uses: list[ToolUseBlock] = [b for b in response.content if isinstance(b, ToolUseBlock)]
        if not tool_uses:
            finish_reason = response.stop_reason or "end_turn"
            break

        tool_results, captured = await _dispatch_tool_uses(tool_uses=tool_uses, turn_id=turn_id)
        messages.append({"role": "user", "content": tool_results})

        if captured is not None:
            submitted_args = captured
            finish_reason = "submit_work_order"
            break

    if submitted_args is not None:
        await _persist_and_announce(
            work_order_id=work_order_id, args=submitted_args, turn_id=turn_id
        )
    else:
        log.warning(
            "Work Order Generator exhausted turns without submit_work_order for WO %d",
            work_order_id,
        )

    await ws_manager.broadcast(
        "agent_end",
        {
            "agent": "work_order_generator",
            "turn_id": turn_id,
            "finish_reason": finish_reason,
        },
    )


# ---------------------------------------------------------------------------
# Tool dispatch
# ---------------------------------------------------------------------------


async def _dispatch_tool_uses(
    *, tool_uses: list[ToolUseBlock], turn_id: str
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Run each tool_use and return (tool_results, submit_args_or_None).

    The second element is the ``submit_work_order`` args dict when the
    LLM called the terminal tool, ``None`` otherwise. The caller breaks
    the outer loop when it is not ``None``.
    """
    tool_results: list[dict[str, Any]] = []
    submit_args: dict[str, Any] | None = None

    for tool_use in tool_uses:
        name = tool_use.name
        args = dict(tool_use.input) if isinstance(tool_use.input, dict) else {}

        await ws_manager.broadcast(
            "tool_call_started",
            {
                "agent": "work_order_generator",
                "tool_name": name,
                "args": args,
                "turn_id": turn_id,
            },
        )
        t0 = time.monotonic()

        try:
            if name.startswith("render_"):
                content, is_error = await _handle_render(name, args, turn_id)
            elif name == "submit_work_order":
                submit_args = args
                content, is_error = "work order submitted", False
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
                "agent": "work_order_generator",
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

    return tool_results, submit_args


async def _handle_render(name: str, args: dict[str, Any], turn_id: str) -> tuple[str, bool]:
    """``render_*`` tools: broadcast ``ui_render`` + return 'rendered'."""
    component = name.removeprefix("render_")
    await ws_manager.broadcast(
        "ui_render",
        {
            "agent": "work_order_generator",
            "component": component,
            "props": args,
            "turn_id": turn_id,
        },
    )
    return "rendered", False


# ---------------------------------------------------------------------------
# Persistence + completion broadcast
# ---------------------------------------------------------------------------


_UPDATE_FIELDS = (
    "title",
    "description",
    "recommended_actions",
    "required_parts",
    "priority",
    "estimated_duration_min",
    "suggested_window_start",
    "suggested_window_end",
)


def _parse_dt(value: Any) -> datetime | None:
    """Parse an ISO-8601 string into a ``datetime``; ``None`` on anything else.

    The LLM is free-form, and the tool schema asks for ``date-time`` but
    won't validate at call time. Silently drop malformed values — the
    fields are Optional on ``WorkOrderUpdate`` so this does not break the
    write, it just leaves the maintenance window unset.
    """
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


async def _persist_and_announce(*, work_order_id: int, args: dict[str, Any], turn_id: str) -> None:
    """Apply the submitted fields to ``work_order`` and broadcast ready."""
    update_fields: dict[str, Any] = {}
    for key in _UPDATE_FIELDS:
        if key in args and args[key] is not None:
            update_fields[key] = args[key]

    # Normalise datetime strings — asyncpg accepts datetime, not ISO string.
    for key in ("suggested_window_start", "suggested_window_end"):
        if key in update_fields:
            dt = _parse_dt(update_fields[key])
            if dt is None:
                update_fields.pop(key, None)
            else:
                update_fields[key] = dt

    # Final state transition into the operator-visible queue.
    update_fields["status"] = "open"

    async with db.pool.acquire() as conn:
        await WorkOrderRepository(conn).update(work_order_id, update_fields)

    await ws_manager.broadcast(
        "work_order_ready",
        {"work_order_id": work_order_id},
    )


# ---------------------------------------------------------------------------
# Failure end — no work_order_ready; operator can trigger manual regen
# ---------------------------------------------------------------------------


async def _fail_end(turn_id: str, reason: str) -> None:
    """Emit ``agent_end`` with ``finish_reason="error"``. Keep WO unchanged.

    The Investigator already flipped the work order to ``status='analyzed'``
    with a populated ``rca_summary``. A Work-Order-Generator failure does
    not invalidate that — the operator can still read the RCA and hit a
    frontend "Regenerate work order" button to retry.
    """
    await ws_manager.broadcast(
        "agent_end",
        {
            "agent": "work_order_generator",
            "turn_id": turn_id,
            "finish_reason": f"error:{reason}",
        },
    )
