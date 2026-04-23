"""Investigator agent subpackage (#25 / M4.3 + #103 / M5.5).

Split by concern (mirrors :mod:`agents.kb_builder`):

- :mod:`agents.investigator.prompts` — ``INVESTIGATOR_SYSTEM`` template.
- :mod:`agents.investigator.schemas` — local agent-only tool schemas
  (``SUBMIT_RCA_TOOL``, ``ASK_KB_BUILDER_TOOL``).
- :mod:`agents.investigator.service` — ``run_investigator`` dispatcher
  + ``run_investigator_messages_api`` (M4.5 hand-rolled loop with
  extended thinking) + public custom-tool handlers (``handle_render``,
  ``handle_submit_rca``, ``fallback_rca``).
- :mod:`agents.investigator.managed` — ``run_investigator_managed``
  (M5.5 Managed Agents driver with hosted MCP).
- :mod:`agents.investigator.handoff` — handoff helpers: KB-Builder
  delegation and Work-Order-Generator spawn.

``run_investigator`` is the only public entrypoint Sentinel calls. It
branches on ``settings.investigator_use_managed`` to either the M4.5
Messages API path or the M5.5 Managed Agents path. Switch takes <5 min
(env var + restart) — M4.5 is the demo-day safety net.
"""

from agents.investigator.prompts import INVESTIGATOR_SYSTEM
from agents.investigator.schemas import ASK_KB_BUILDER_TOOL, SUBMIT_RCA_TOOL
from agents.investigator.service import MAX_TURNS, run_investigator

__all__ = [
    "ASK_KB_BUILDER_TOOL",
    "INVESTIGATOR_SYSTEM",
    "MAX_TURNS",
    "SUBMIT_RCA_TOOL",
    "run_investigator",
]
