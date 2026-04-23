"""KB Builder Q&A handler — M3.5 (`ask_kb_builder` tool target).

This module exposes :func:`answer_kb_question`, a pure async function called by
the M4.6 Investigator orchestrator when it needs to look up a factual detail
from an equipment knowledge base.

Contract (see issue #21):

- **No DB writes.** The function only reads via :func:`mcp_client.call_tool`
  (``get_equipment_kb``).
- **No WebSocket broadcasts.** All ``agent_handoff`` / ``agent_start`` /
  ``agent_end`` events are emitted by the M4.6 orchestrator wrapper. If this
  function also broadcast, the Activity Feed would show duplicates.
- **Always Sonnet.** Uses ``model_for("chat")`` so a demo-day flip to
  ``ARIA_MODEL=opus`` does not silently 10x the cost of a simple factual lookup.
- **Safe fallback on failure.** Returns a ``{answer, source, confidence}`` dict
  on every error path so the Investigator's tool loop can continue with an
  ``is_error=True`` ``tool_result`` rather than crashing the investigation.
"""

from __future__ import annotations

import logging

from agents.anthropic_client import anthropic, model_for, parse_json_response
from aria_mcp.client import mcp_client

_log = logging.getLogger("aria.kb_builder")

_KB_QUESTION_SYSTEM = (
    "You answer factual questions from a colleague agent investigating an "
    "equipment failure. Use the knowledge base below. If the information is "
    "missing, say 'unknown' — do not guess. Response format: JSON object with "
    "keys: answer (str), source (str|null), confidence (0.0-1.0)."
)


async def answer_kb_question(cell_id: int, question: str) -> dict:
    """Answer a factual KB question on behalf of the Investigator.

    Args:
        cell_id: The production cell whose equipment KB should be consulted.
        question: Free-text question from the Investigator agent.

    Returns:
        ``{"answer": str, "source": str | None, "confidence": float}``.
        Always returns a dict — never raises — so the Investigator tool loop
        can keep reasoning even if the KB is missing or the LLM call fails.
    """
    try:
        kb_result = await mcp_client.call_tool("get_equipment_kb", {"cell_id": cell_id})
        if kb_result.is_error:
            return {
                "answer": f"KB not available for cell {cell_id}",
                "source": None,
                "confidence": 0.0,
            }

        response = await anthropic.messages.create(
            model=model_for("chat"),  # always Sonnet — see module docstring
            max_tokens=1024,
            system=_KB_QUESTION_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": (f"Equipment KB:\n{kb_result.content}\n\nQuestion: {question}"),
                }
            ],
        )

        return parse_json_response(response)

    except Exception as exc:  # noqa: BLE001 — safe fallback for tool-loop continuation
        _log.warning("answer_kb_question failed for cell %d: %s", cell_id, exc)
        return {
            "answer": "KB query failed — information unavailable",
            "source": None,
            "confidence": 0.0,
        }
