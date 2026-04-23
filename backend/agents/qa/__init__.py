"""Q&A agent subpackage — Messages API path (#31 / M5.2).

Split by concern (mirrors :mod:`agents.kb_builder`):

- :mod:`agents.qa.prompts` — system prompts (``QA_SYSTEM``,
  ``INVESTIGATOR_QA_SYSTEM``).
- :mod:`agents.qa.schemas` — local agent-only tool schemas
  (``ASK_INVESTIGATOR_TOOL``).
- :mod:`agents.qa.tool_dispatch` — shared handlers:
  ``handle_render``, ``handle_ask_investigator``,
  ``summarise_tool_result``, ``safe_send``.
- :mod:`agents.qa.messages_api` — ``run_qa_turn`` (M5.2 agent loop).
- :mod:`agents.qa.investigator_qa` — ``answer_investigator_question``
  diagnostic fast-path used by ``ask_investigator``.

The Managed-Agents Q&A path (``agents.qa.managed`` in M5.4) was removed
in M5.5 (#103). The audit
([docs/audits/M5-managed-agents-refactor-audit.md]) concluded that
interactive sub-second Q&A is the wrong target for Managed Agents; the
Investigator is the Managed Agents anchor now. Q&A stays on Messages
API where token-granular streaming is native.

Public symbols are re-exported here so callers can keep importing from
``agents.qa`` without knowing the internal layout.
"""

from agents.qa.investigator_qa import answer_investigator_question
from agents.qa.messages_api import run_qa_turn
from agents.qa.prompts import QA_SYSTEM
from agents.qa.schemas import ASK_INVESTIGATOR_TOOL

__all__ = [
    "ASK_INVESTIGATOR_TOOL",
    "QA_SYSTEM",
    "answer_investigator_question",
    "run_qa_turn",
]
