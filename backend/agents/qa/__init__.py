"""Q&A agent subpackage — Messages API path (#31 / M5.2) + Managed Agents path (#33 / M5.4).

Split by concern (mirrors :mod:`agents.kb_builder`):

- :mod:`agents.qa.prompts` — system prompts (``QA_SYSTEM``,
  ``INVESTIGATOR_QA_SYSTEM``).
- :mod:`agents.qa.schemas` — local agent-only tool schemas
  (``ASK_INVESTIGATOR_TOOL``) and the Managed-Agents custom-tool wrapper
  (``build_custom_tools``).
- :mod:`agents.qa.tool_dispatch` — shared handlers consumed by BOTH
  paths: ``handle_render``, ``handle_ask_investigator``,
  ``summarise_tool_result``, ``safe_send``.
- :mod:`agents.qa.messages_api` — ``run_qa_turn`` (M5.2 agent loop).
- :mod:`agents.qa.managed` — ``run_qa_turn_managed`` (M5.4 Managed
  Agents driver).
- :mod:`agents.qa.investigator_qa` — ``answer_investigator_question``
  diagnostic fast-path used by ``ask_investigator``.

Public symbols are re-exported here so callers can keep importing from
``agents.qa`` without knowing the internal layout.
"""

from agents.qa.investigator_qa import answer_investigator_question
from agents.qa.managed import run_qa_turn_managed
from agents.qa.messages_api import run_qa_turn
from agents.qa.prompts import QA_SYSTEM
from agents.qa.schemas import ASK_INVESTIGATOR_TOOL

__all__ = [
    "ASK_INVESTIGATOR_TOOL",
    "QA_SYSTEM",
    "answer_investigator_question",
    "run_qa_turn",
    "run_qa_turn_managed",
]
