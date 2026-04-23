"""Bootstrap helpers for the managed Investigator (#103 / M5.5).

Lazy creation of the Anthropic-side environment + agent definition
(cached process-wide) plus per-work-order session creation. Also owns
the static builders that shape the agent config:

- ``_build_system_prompt`` — resolves the M4.5 ``{past_failures}``
  placeholder to a pointer so the per-run past-failures context can
  land in the initial ``user.message`` instead.
- ``_build_custom_tools`` — the three tool kinds that genuinely need
  our backend (``submit_rca``, ``ask_kb_builder``, ``render_*``)
  wrapped in the Managed Agents custom envelope.
- ``_build_mcp_servers`` — single-entry hosted-MCP registration
  pointing at our path-secret URL; refuses to run if the URL is empty.

The bootstrap cache (``_agent_id`` / ``_environment_id`` / ``_bootstrap_lock``)
is module-level here — tests reset it via ``monkeypatch.setattr`` on the
submodule namespace before every run.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, cast

from agents.anthropic_client import anthropic, model_for
from agents.investigator.prompts import INVESTIGATOR_SYSTEM
from agents.investigator.schemas import ASK_KB_BUILDER_TOOL, SUBMIT_RCA_TOOL
from agents.ui_tools import INVESTIGATOR_RENDER_TOOLS
from core.config import get_settings

log = logging.getLogger("aria.investigator.managed.bootstrap")

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


async def ensure_agent_and_env() -> tuple[str, str]:
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
            # NOTE: extended thinking is NOT a valid kwarg on
            # ``anthropic.beta.agents.create`` (managed-agents-2026-04-01).
            # The API surface is intentionally narrow — see
            # ``docs/audits/M5.5-end-to-end-test-report.md`` for findings.
            "betas": cast(Any, [beta]),
        }
        mcp_servers = _build_mcp_servers()
        if mcp_servers:
            agent_kwargs["mcp_servers"] = cast(Any, mcp_servers)
            # Managed Agents requires every declared mcp_server to be referenced
            # by an ``mcp_toolset`` entry in ``tools``; otherwise create() returns
            # 400 "mcp_servers [aria] declared but no mcp_toolset in tools
            # references them". Append one toolset per server name.
            existing_tools = list(agent_kwargs["tools"])
            for server in mcp_servers:
                existing_tools.append(
                    {
                        "type": "mcp_toolset",
                        "mcp_server_name": server["name"],
                        # Auto-approve all MCP tool calls — without this the default
                        # permission_policy is ``always_ask``, which pauses the agent
                        # loop waiting for a human confirmation that never arrives.
                        "default_config": {
                            "permission_policy": {"type": "always_allow"},
                        },
                    }
                )
            agent_kwargs["tools"] = cast(Any, existing_tools)

        agent = await anthropic.beta.agents.create(**agent_kwargs)
        _agent_id = agent.id
        log.info("bootstrapped managed investigator agent %s in env %s", agent.id, env.id)
        return _agent_id, _environment_id


async def create_session(agent_id: str, env_id: str, turn_id: str) -> str:
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
# Static builders (system prompt, custom tools, hosted-MCP registration)
# ---------------------------------------------------------------------------


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


def _strip_additional_properties(schema: dict[str, Any]) -> dict[str, Any]:
    """Remove ``additionalProperties`` recursively.

    Managed Agents (``managed-agents-2026-04-01``) rejects custom-tool input
    schemas containing ``additionalProperties`` ("Extra inputs are not
    permitted"), unlike the Messages API which accepts it. Strip it so the
    same Anthropic-format tool definitions can be reused on both paths.
    """
    if not isinstance(schema, dict):
        return schema
    cleaned = {k: v for k, v in schema.items() if k != "additionalProperties"}
    for k, v in list(cleaned.items()):
        if isinstance(v, dict):
            cleaned[k] = _strip_additional_properties(v)
        elif isinstance(v, list):
            cleaned[k] = [
                _strip_additional_properties(item) if isinstance(item, dict) else item for item in v
            ]
    return cleaned


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
            "input_schema": _strip_additional_properties(SUBMIT_RCA_TOOL["input_schema"]),
        },
        {
            "type": "custom",
            "name": ASK_KB_BUILDER_TOOL["name"],
            "description": ASK_KB_BUILDER_TOOL["description"],
            "input_schema": _strip_additional_properties(ASK_KB_BUILDER_TOOL["input_schema"]),
        },
    ]
    custom.extend(
        {
            "type": "custom",
            "name": t["name"],
            "description": t["description"],
            "input_schema": _strip_additional_properties(t["input_schema"]),
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
