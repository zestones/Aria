"""Investigator Managed Agents driver (#103 / M5.5).

Mirrors :func:`agents.investigator.service.run_investigator_messages_api`
in wire contract (same ``agent_start``/``agent_end``/``thinking_delta``/
``tool_call_started``/``tool_call_completed``/``rca_ready`` event-bus
broadcasts, same DB writes via ``submit_rca``, same Work Order
Generator handoff) but drives the investigation through
``client.beta.sessions.events.stream`` on an Anthropic-hosted session.

Why this module exists
----------------------
- The M5.4 Q&A Managed Agents experiment fought the platform: Q&A is
  interactive sub-second and Managed Agents emits block-granular text
  events. The audit ([docs/audits/M5-managed-agents-refactor-audit.md])
  pivoted the prize anchor onto the Investigator, which IS the platform's
  target profile — long-running (12 turns, ~120 s), tool-heavy, async.
- Delivers three Managed-Agents-only capabilities:
  1. **Hosted agent loop** — Anthropic runs the ``for _turn in range(...)``
     server-side; no manual ``messages: list`` or signed-thinking-block
     reconstruction on our side.
  2. **Hosted MCP** — Anthropic calls our ``/mcp/<path-secret>`` endpoint
     directly for the 14 read-only MCP tools. Our backend is not in the
     loop for tool execution. See :mod:`main` for the mount setup.
  3. **Session persistence** — the ``session_id`` is stored on the
     ``work_order`` row so M5.6 can reopen the same investigation hours
     later with the full reasoning trace still on Anthropic's side.

Only three tool kinds still need our process (custom tools):

- ``submit_rca`` — writes the RCA row + spawns Work Order Generator.
- ``ask_kb_builder`` — dynamic handoff to the KB Builder handler.
- ``render_*`` — the 3 generative-UI tools (``render_signal_chart``,
  ``render_diagnostic_card``, ``render_pattern_match``).

The 14 MCP tools route via hosted MCP; our backend sees zero
``_dispatch_custom_tool`` traffic for them on this path.

Event flow
----------
1. Bootstrap: create environment + agent lazily on first run
   (process-wide cache, lock-gated).
2. Per work_order: create a fresh session, open
   ``sessions.events.stream``, send the initial ``user.message`` with
   the WO context + past-failures snapshot.
3. Iterate events:

   - ``agent.thinking`` → broadcast one ``EventBusMap.thinking_delta``
     frame per reasoning block (no per-chunk granularity — Managed
     Agents emits whole thinking events, not deltas).
   - ``agent.custom_tool_use`` → buffer by id until the session idles.
   - ``session.status_idle``:
     - ``stop_reason.type == "requires_action"`` → dispatch each pending
       custom tool (``submit_rca`` / ``ask_kb_builder`` / ``render_*``)
       and send ``user.custom_tool_result`` events.
     - ``stop_reason.type == "end_turn"`` → investigation done.
     - ``stop_reason.type == "retries_exhausted"`` → fallback path.
   - ``session.status_terminated`` / ``session.error`` → fallback path.

4. On ``submit_rca`` success, the handler persists the
   ``investigator_session_id`` on the WO row so M5.6 can resume later.

Security posture
----------------
The ``/mcp/<secret>`` endpoint is a public surface once the Cloudflare
tunnel is up. Anthropic's ``mcp_servers`` config does NOT forward custom
HTTP headers (docs: *"No auth tokens are provided at this stage."*), so
the path itself carries the secret. Rotate ``ARIA_MCP_PATH_SECRET`` to
invalidate a leaked URL.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, cast

from agents.anthropic_client import anthropic, model_for
from agents.investigator import handoff, service
from agents.investigator.prompts import INVESTIGATOR_SYSTEM
from agents.investigator.schemas import ASK_KB_BUILDER_TOOL, SUBMIT_RCA_TOOL
from agents.ui_tools import INVESTIGATOR_RENDER_TOOLS
from aria_mcp.client import mcp_client
from core.config import get_settings
from core.ws_manager import current_turn_id, ws_manager

log = logging.getLogger("aria.investigator.managed")

# Overall wall-clock budget for a managed run. Longer than the M4.5
# 120s because Managed Agents sessions can include hosted-MCP network
# round-trips Anthropic → our tunnel → our FastAPI.
_TIMEOUT_SECONDS = 180.0

# Extended thinking budget for the agent definition. Same budget as
# M4.5 so the reasoning depth is comparable across paths. The SDK may
# reject this config if the Managed Agents beta has not enabled it yet
# — bootstrap will surface the error and the outer try/except routes
# the WO to ``fallback_rca``.
_THINKING_BUDGET = 10000

_AGENT_NAME = "aria-investigator"
_ENV_NAME = "aria-investigator-env"

# Process-wide cache. The agent definition and environment are immutable
# once created — the session (per-WO) is the thing that grows.
# ``_bootstrap_lock`` prevents two concurrent anomaly alerts from racing
# to create duplicate agents/environments on the first run after boot.
_bootstrap_lock = asyncio.Lock()
_agent_id: str | None = None
_environment_id: str | None = None


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


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
        await service.fallback_rca(work_order_id, "Managed investigation timed out", turn_id)
    except Exception as exc:  # noqa: BLE001 — outer asyncio task must never raise
        log.exception("managed investigator crashed for WO %d", work_order_id)
        await service.fallback_rca(
            work_order_id, f"Managed investigation failed: {type(exc).__name__}", turn_id
        )
    finally:
        current_turn_id.reset(token)


# ---------------------------------------------------------------------------
# Loop body — load context, create session, drive events
# ---------------------------------------------------------------------------


async def _drive_investigation(work_order_id: int, turn_id: str) -> None:
    """Load WO context via MCP, create session, drive events, broadcast end."""
    await ws_manager.broadcast("agent_start", {"agent": "investigator", "turn_id": turn_id})

    wo_result = await mcp_client.call_tool("get_work_order", {"work_order_id": work_order_id})
    if wo_result.is_error:
        await service.fallback_rca(
            work_order_id, f"get_work_order failed: {wo_result.content[:200]}", turn_id
        )
        return
    try:
        wo_data = json.loads(wo_result.content) if wo_result.content else {}
    except json.JSONDecodeError:
        wo_data = {}
    cell_id = wo_data.get("cell_id")
    if cell_id is None:
        await service.fallback_rca(work_order_id, "get_work_order returned no cell_id", turn_id)
        return

    past_result = await mcp_client.call_tool(
        "get_failure_history", {"cell_id": cell_id, "limit": 5}
    )
    past_text = past_result.content if not past_result.is_error else "[]"

    agent_id, env_id = await _ensure_agent_and_env()
    session_id = await _create_session(agent_id, env_id, turn_id)

    user_text = (
        f"Anomaly detected on cell {cell_id}. "
        f"Work order #{work_order_id}: {wo_data.get('title', '(untitled)')}. "
        f"\n\nPast failures context for this cell:\n{past_text}\n\n"
        "Investigate freely using your tools (MCP + ask_kb_builder + render_*) "
        "and call `submit_rca` exactly once when you have enough evidence."
    )

    submitted = await _drive_session_events(
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
        await service.fallback_rca(
            work_order_id, "Managed agent ended without submitting an RCA", turn_id
        )
        return

    await ws_manager.broadcast(
        "agent_end",
        {"agent": "investigator", "turn_id": turn_id, "finish_reason": finish_reason},
    )


# ---------------------------------------------------------------------------
# Bootstrap — lazy environment + agent creation (process-wide cache)
# ---------------------------------------------------------------------------


async def _ensure_agent_and_env() -> tuple[str, str]:
    """Return cached (agent_id, environment_id), creating them on first call."""
    global _agent_id, _environment_id
    async with _bootstrap_lock:
        if _agent_id and _environment_id:
            return _agent_id, _environment_id

        beta = get_settings().managed_agents_beta

        env = await anthropic.beta.environments.create(
            name=_ENV_NAME,
            config={"type": "cloud"},
            betas=cast(Any, [beta]),
        )
        _environment_id = env.id
        log.info("created managed agents environment %s", env.id)

        agent_kwargs: dict[str, Any] = {
            "name": _AGENT_NAME,
            "model": cast(Any, model_for("reasoning")),
            "system": _build_system_prompt(),
            "tools": cast(Any, _build_custom_tools()),
            # Extended thinking matches the M4.5 budget so reasoning depth is
            # comparable across paths and `agent.thinking` events get emitted
            # for the Inspector's live trace (#103 acceptance).
            "thinking": cast(Any, {"type": "enabled", "budget_tokens": _THINKING_BUDGET}),
            "betas": cast(Any, [beta]),
        }
        mcp_servers = _build_mcp_servers()
        if mcp_servers:
            agent_kwargs["mcp_servers"] = cast(Any, mcp_servers)

        agent = await anthropic.beta.agents.create(**agent_kwargs)
        _agent_id = agent.id
        log.info("bootstrapped managed investigator agent %s in env %s", agent.id, env.id)
        return _agent_id, _environment_id


def _build_system_prompt() -> str:
    """Resolve the M4.5 ``{past_failures}`` placeholder for static reuse.

    Managed Agents pins the system prompt at agent-creation time and
    reuses it across sessions — so per-run context (the actual failure
    history for the anomaly's cell) lands in the initial ``user.message``
    instead, and the prompt carries a pointer to it.
    """
    return INVESTIGATOR_SYSTEM.format(
        past_failures="(The specific past-failure context for this cell "
        "is provided in the first user message.)"
    )


def _build_custom_tools() -> list[dict[str, Any]]:
    """Wrap the three tool kinds that need our backend in the custom envelope.

    MCP tools are NOT wrapped — they route via hosted MCP (see
    :func:`_build_mcp_servers`). The agent definition sees only the
    custom escape-hatch tools plus whatever the hosted MCP server
    advertises.
    """
    custom: list[dict[str, Any]] = [
        {
            "type": "custom",
            "name": SUBMIT_RCA_TOOL["name"],
            "description": SUBMIT_RCA_TOOL["description"],
            "input_schema": SUBMIT_RCA_TOOL["input_schema"],
        },
        {
            "type": "custom",
            "name": ASK_KB_BUILDER_TOOL["name"],
            "description": ASK_KB_BUILDER_TOOL["description"],
            "input_schema": ASK_KB_BUILDER_TOOL["input_schema"],
        },
    ]
    custom.extend(
        {
            "type": "custom",
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["input_schema"],
        }
        for t in INVESTIGATOR_RENDER_TOOLS
    )
    return custom


def _build_mcp_servers() -> list[dict[str, Any]] | None:
    """Hosted MCP registration (or None when the public URL is not set).

    When ``ARIA_MCP_PUBLIC_URL`` is empty we refuse to bootstrap rather
    than silently fall back to wrapping MCP tools as custom tools —
    that would re-create the M5.4 anti-pattern (see audit §3). Operators
    should either set up the tunnel or disable the managed path with
    ``INVESTIGATOR_USE_MANAGED=false``.
    """
    url = (get_settings().aria_mcp_public_url or "").strip()
    if not url:
        raise RuntimeError(
            "ARIA_MCP_PUBLIC_URL is empty but INVESTIGATOR_USE_MANAGED=true. "
            "Managed Investigator requires a tunneled /mcp/<path-secret> URL "
            "(see README). Set INVESTIGATOR_USE_MANAGED=false to use the "
            "M4.5 Messages API fallback."
        )
    # Anthropic's ``mcp_servers`` schema per the docs: ``{type, name, url}``.
    # The URL must include the path secret — Anthropic cannot forward an
    # Authorization header.
    return [{"type": "url", "name": "aria", "url": url}]


async def _create_session(agent_id: str, env_id: str, turn_id: str) -> str:
    """Create one session per work_order. Never reused across investigations."""
    beta = get_settings().managed_agents_beta
    session = await anthropic.beta.sessions.create(
        agent=cast(Any, agent_id),
        environment_id=env_id,
        title=f"ARIA Investigator — turn {turn_id[:8]}",
        betas=cast(Any, [beta]),
    )
    log.info("created managed investigator session %s", session.id)
    return str(session.id)


# ---------------------------------------------------------------------------
# Event loop — consume stream, dispatch tools on requires_action
# ---------------------------------------------------------------------------


async def _drive_session_events(
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
                    submitted_in_batch = await _resolve_pending_tools(
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


async def _resolve_pending_tools(
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
            log.warning(
                "managed investigator requires_action references unknown event %s", event_id
            )
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
