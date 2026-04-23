"""Work Order Generator tool schema (#30 / M5.1).

:data:`SUBMIT_WORK_ORDER_TOOL` is the terminal tool that ends the loop
and triggers persistence + ``work_order_ready`` broadcast.
"""

from __future__ import annotations

from typing import Any

SUBMIT_WORK_ORDER_TOOL: dict[str, Any] = {
    "name": "submit_work_order",
    "description": (
        "Submit the completed work order. Call exactly once when you have "
        "assembled a title, ordered action steps, required parts, and a "
        "sensible maintenance window. This ends the agent loop."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "maxLength": 200,
                "description": "Short, action-oriented WO title for the technician.",
            },
            "description": {
                "type": "string",
                "description": "One-paragraph summary for the work order header.",
            },
            "recommended_actions": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Ordered procedure steps the technician will follow.",
            },
            "required_parts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "ref": {"type": "string"},
                        "qty": {"type": "integer", "minimum": 1},
                    },
                    "required": ["ref", "qty"],
                },
                "description": "Parts needed, each with a manufacturer reference and quantity.",
            },
            "priority": {
                "type": "string",
                "enum": ["low", "medium", "high", "critical"],
            },
            "estimated_duration_min": {
                "type": "integer",
                "minimum": 1,
                "description": "Estimated duration of the intervention, in minutes.",
            },
            "suggested_window_start": {
                "type": "string",
                "format": "date-time",
                "description": "ISO-8601 with TZ — earliest time the intervention should start.",
            },
            "suggested_window_end": {
                "type": "string",
                "format": "date-time",
                "description": "ISO-8601 with TZ — latest time the intervention should complete.",
            },
        },
        "required": [
            "title",
            "recommended_actions",
            "required_parts",
            "priority",
        ],
    },
}
