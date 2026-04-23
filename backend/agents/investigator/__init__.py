"""Investigator agent subpackage (#25 / M4.3).

Split by concern (mirrors :mod:`agents.kb_builder`):

- :mod:`agents.investigator.prompts` — ``INVESTIGATOR_SYSTEM`` template.
- :mod:`agents.investigator.schemas` — local agent-only tool schemas
  (``SUBMIT_RCA_TOOL``, ``ASK_KB_BUILDER_TOOL``).
- :mod:`agents.investigator.service` — ``run_investigator`` entry point,
  loop body, streamed LLM call, tool dispatch, and the fallback path.
- :mod:`agents.investigator.handoff` — handoff helpers: KB-Builder
  delegation and Work-Order-Generator spawn.

Public symbols are re-exported here so callers can keep importing from
``agents.investigator`` without knowing the internal layout.
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
