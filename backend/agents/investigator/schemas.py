"""Investigator tool schemas (#25 / M4.3).

Two local agent-only tools:

- :data:`SUBMIT_RCA_TOOL` — terminal tool that ends the loop and triggers
  RCA persistence + Work-Order-Generator handoff.
- :data:`ASK_KB_BUILDER_TOOL` — dynamic handoff to the KB Builder
  ``answer_kb_question`` handler (M4.6 agent-as-tool pattern).
"""

from __future__ import annotations

from typing import Any

SUBMIT_RCA_TOOL: dict[str, Any] = {
    "name": "submit_rca",
    "description": (
        "Submit a completed root cause analysis. Call this exactly once, "
        "when you have enough evidence to conclude the investigation. "
        "This ends the agent loop and spawns the Work Order Generator."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "root_cause": {
                "type": "string",
                "description": "Single-sentence conclusion in plain language.",
            },
            "failure_mode": {
                "type": "string",
                "maxLength": 100,
                "description": (
                    "Short machine-friendly classifier for pattern matching "
                    "(e.g. 'bearing_wear', 'cavitation', 'seal_leak'). Max 100 chars."
                ),
            },
            "confidence": {
                "type": "number",
                "minimum": 0,
                "maximum": 1,
                "description": "0.0 to 1.0 — how confident you are in the root cause.",
            },
            "contributing_factors": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Ordered list, most to least significant.",
            },
            "similar_past_failure": {
                "type": ["string", "null"],
                "description": (
                    "Reference a ``failure_history`` entry (id or date label) if "
                    "the current pattern matches a past failure, otherwise null."
                ),
            },
            "recommended_action": {
                "type": "string",
                "description": "What the operator should do next, in one sentence.",
            },
        },
        "required": [
            "root_cause",
            "failure_mode",
            "confidence",
            "contributing_factors",
            "recommended_action",
        ],
    },
}


ASK_KB_BUILDER_TOOL: dict[str, Any] = {
    "name": "ask_kb_builder",
    "description": (
        "Consult the KB Builder for a manufacturer detail absent from the "
        "current knowledge base (e.g. max bolt torque, part reference, "
        "installation spec). Use when the KB lookup you already tried came "
        "back empty and you need a factual value to reason further."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "question": {"type": "string"},
            "cell_id": {"type": "integer"},
        },
        "required": ["question", "cell_id"],
    },
}
