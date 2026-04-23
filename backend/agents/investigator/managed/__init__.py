"""Investigator Managed Agents driver subpackage (#103 / M5.5).

Mirrors :func:`agents.investigator.service.run_investigator_messages_api`
in wire contract (same event-bus broadcasts, same DB writes via
``submit_rca``, same Work Order Generator handoff) but drives the
investigation through ``client.beta.sessions.events.stream`` on an
Anthropic-hosted session.

Why this module exists
----------------------
- The M5.4 Q&A Managed Agents experiment fought the platform: Q&A is
  interactive sub-second and Managed Agents emits block-granular text
  events. The audit ([docs/audits/M5-managed-agents-refactor-audit.md])
  pivoted the prize anchor onto the Investigator, which IS the
  platform's target profile — long-running, tool-heavy, async.
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

Subpackage layout (mirrors :mod:`agents.kb_builder.onboarding` split)
--------------------------------------------------------------------

- :mod:`agents.investigator.managed.service` — public entry point
  (``run_investigator_managed``) and the per-WO orchestration body
  (``_drive_investigation``).
- :mod:`agents.investigator.managed.bootstrap` — lazy environment +
  agent creation (process-wide cache, lock-gated), per-WO session
  creation, and the static tool / MCP-server / system-prompt builders.
- :mod:`agents.investigator.managed.events` — the event loop consuming
  ``sessions.events.stream``. Branches on event type and hands
  ``requires_action`` idles off to ``tool_dispatch``.
- :mod:`agents.investigator.managed.tool_dispatch` — custom-tool
  resolver: maps buffered ``agent.custom_tool_use`` events to
  ``service.handle_render`` / ``service.handle_submit_rca`` /
  ``handoff.handle_ask_kb_builder`` and sends the
  ``user.custom_tool_result`` back.

Only ``run_investigator_managed`` is public; all other symbols are
internal to the subpackage.
"""

from agents.investigator.managed.service import run_investigator_managed

__all__ = ["run_investigator_managed"]
