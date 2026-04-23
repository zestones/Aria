"""Managed Investigator entry point + per-WO orchestration (#103 / M5.5).

Two coroutines:

- :func:`run_investigator_managed` — the public entry point. Wraps the
  per-WO body in a wall-clock timeout + ``try/except`` so every failure
  path routes to :func:`agents.investigator.service.fallback_rca` and
  the ``work_order`` always ends in ``status='analyzed'`` with a
  populated ``rca_summary``. Signature matches the M4.5
  ``run_investigator`` so Sentinel's ``asyncio.create_task`` call is
  unchanged.

- :func:`_drive_investigation` — per-WO body. Loads ``work_order``
  context via MCP (same reads as M4.5), bootstraps the agent +
  environment lazily, creates a fresh session, then hands off to
  :func:`agents.investigator.managed.events.drive_session_events` to
  consume the stream.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from agents.investigator.managed.bootstrap import create_session, ensure_agent_and_env
from agents.investigator.managed.events import drive_session_events
from agents.investigator.service import fallback_rca
from aria_mcp.client import mcp_client
from core.ws_manager import current_turn_id, ws_manager

log = logging.getLogger("aria.investigator.managed.service")

# Overall wall-clock budget for a managed run. Longer than the M4.5
# 120s because Managed Agents sessions can include hosted-MCP network
# round-trips Anthropic → our tunnel → our FastAPI.
_TIMEOUT_SECONDS = 180.0


async def run_investigator_managed(work_order_id: int) -> None:
    """Drive one managed investigation to completion.

    Never raises. Timeouts and crashes route to
    :func:`agents.investigator.service.fallback_rca` so the work_order
    always ends in ``status='analyzed'`` with a populated
    ``rca_summary``.
    """
    turn_id = uuid.uuid4().hex
    token = current_turn_id.set(turn_id)
    try:
        await asyncio.wait_for(
            _drive_investigation(work_order_id, turn_id),
            timeout=_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        log.warning("managed investigator timed out for WO %d", work_order_id)
        await fallback_rca(work_order_id, "Managed investigation timed out", turn_id)
    except Exception as exc:  # noqa: BLE001 — outer asyncio task must never raise
        log.exception("managed investigator crashed for WO %d", work_order_id)
        await fallback_rca(
            work_order_id, f"Managed investigation failed: {type(exc).__name__}", turn_id
        )
    finally:
        current_turn_id.reset(token)


async def _drive_investigation(work_order_id: int, turn_id: str) -> None:
    """Load WO context via MCP, create session, drive events, broadcast end."""
    await ws_manager.broadcast("agent_start", {"agent": "investigator", "turn_id": turn_id})

    wo_result = await mcp_client.call_tool("get_work_order", {"work_order_id": work_order_id})
    if wo_result.is_error:
        await fallback_rca(
            work_order_id, f"get_work_order failed: {wo_result.content[:200]}", turn_id
        )
        return
    try:
        wo_data = json.loads(wo_result.content) if wo_result.content else {}
    except json.JSONDecodeError:
        wo_data = {}
    cell_id = wo_data.get("cell_id")
    if cell_id is None:
        await fallback_rca(work_order_id, "get_work_order returned no cell_id", turn_id)
        return

    past_result = await mcp_client.call_tool(
        "get_failure_history", {"cell_id": cell_id, "limit": 5}
    )
    past_text = past_result.content if not past_result.is_error else "[]"

    agent_id, env_id = await ensure_agent_and_env()
    session_id = await create_session(agent_id, env_id, turn_id)

    user_text = (
        f"Anomaly detected on cell {cell_id}. "
        f"Work order #{work_order_id}: {wo_data.get('title', '(untitled)')}. "
        f"\n\nPast failures context for this cell:\n{past_text}\n\n"
        "Investigate freely using your tools (MCP + ask_kb_builder + render_*) "
        "and call `submit_rca` exactly once when you have enough evidence."
    )

    submitted = await drive_session_events(
        session_id=session_id,
        work_order_id=work_order_id,
        cell_id=cell_id,
        turn_id=turn_id,
        user_text=user_text,
    )

    finish_reason = "submit_rca" if submitted else "end_turn"
    if not submitted:
        # Agent idled without calling submit_rca — surface the failure
        # rather than leaving the WO in a half-investigated state.
        await fallback_rca(work_order_id, "Managed agent ended without submitting an RCA", turn_id)
        return

    await ws_manager.broadcast(
        "agent_end",
        {"agent": "investigator", "turn_id": turn_id, "finish_reason": finish_reason},
    )
