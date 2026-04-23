"""Q&A agent tool schemas.

- :data:`ASK_INVESTIGATOR_TOOL` — local agent-only handoff tool that
  delegates a diagnostic question to :func:`answer_investigator_question`.
- :func:`build_custom_tools` — wraps every MCP / ``render_*`` /
  ``ask_investigator`` schema in the Managed-Agents custom-tool
  envelope (``{"type": "custom", ...}``), used by the M5.4 path.
"""

from __future__ import annotations

from typing import Any

from agents.ui_tools import QA_RENDER_TOOLS

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


def build_custom_tools(mcp_schemas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Wrap every tool schema as a Managed-Agents ``custom`` tool.

    Each input schema must have been declared locally (MCP / ui_tools /
    ASK_INVESTIGATOR_TOOL); we only relabel the outer envelope.
    """
    schemas: list[dict[str, Any]] = list(mcp_schemas)
    schemas.extend(QA_RENDER_TOOLS)
    schemas.append(ASK_INVESTIGATOR_TOOL)
    return [
        {
            "type": "custom",
            "name": s["name"],
            "description": s["description"],
            "input_schema": s["input_schema"],
        }
        for s in schemas
    ]
