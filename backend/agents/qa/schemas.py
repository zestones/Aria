"""Q&A agent tool schemas.

:data:`ASK_INVESTIGATOR_TOOL` — local agent-only handoff tool that
delegates a diagnostic question to
:func:`agents.qa.investigator_qa.answer_investigator_question`.
"""

from __future__ import annotations

from typing import Any

ASK_INVESTIGATOR_TOOL: dict[str, Any] = {
    "name": "ask_investigator",
    "description": (
        "Consult the Investigator agent for a diagnostic analysis when the user "
        "asks about an anomaly, root cause, or why something failed. Returns an "
        "RCA summary with cited evidence (recent work orders + past failures). "
        "Use this instead of answering from raw signals when the question "
        "implies causation ('why did X trip', 'what caused Y'). Do NOT use for "
        "simple data lookups — use the MCP signal / KPI / logbook tools directly."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "cell_id": {"type": "integer"},
            "question": {"type": "string"},
        },
        "required": ["cell_id", "question"],
    },
}
