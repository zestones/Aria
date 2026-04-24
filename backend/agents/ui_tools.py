"""Generative-UI render tool schemas for ARIA agents (M2.9 — issue #16).

These are **local agent tools** — NOT FastMCP/MCP tools. They carry no backend
logic whatsoever: when an agent emits a ``render_*`` ``tool_use`` block, the
orchestrator captures it, broadcasts a ``ui_render`` WebSocket event, and
immediately returns ``"rendered"`` as the ``tool_result`` without touching the
database.

Declared here in Anthropic Messages API tool format so every agent that needs
them can do:

    from agents.ui_tools import INVESTIGATOR_RENDER_TOOLS, QA_RENDER_TOOLS

    tools = await mcp_client.get_tools_schema() + INVESTIGATOR_RENDER_TOOLS

Design decisions
----------------
* ``render_correlation_matrix`` was **dropped** (see audit gap #2).
  There is no MCP tool computing signal correlations, so the LLM would
  synthesise plausible-looking but made-up numbers — fatal for a
  predictive-maintenance demo. ``render_signal_chart`` with multi-signal
  overlay (``signal_def_ids: list[int]``) already covers the visual
  message. A future ``compute_correlations`` MCP tool could re-introduce it.

* ``cell_id`` added to every tool's props (audit gap #3).  The frontend
  ``ArtifactRenderer`` (M7.5) filters rendered components by ``cell_id``; without
  it the frontend would need a ``signal_def → cell`` lookup map for every event.

* ``render_alert_banner`` is **NOT** in any agent's ``tools_schema`` — Sentinel
  emits ``ui_render`` events for it directly via ``ws_manager.broadcast`` without
  going through the LLM loop.  Its schema is exported separately as
  ``ALERT_BANNER_SCHEMA`` for WSManager-side validation (M4 scope).

``render_signal_chart`` data flow
----------------------------------
Props carry identifiers only (``signal_def_id``, ``window_hours``) — not raw
time-series.  The frontend component fetches actual data from:

    GET /api/v1/signals/data/{signal_def_id}?window_start=...&window_end=...

This REST re-fetch happens in the ``<SignalChart>`` React component after the
``ui_render`` event arrives.  The backend endpoint already exists (signal router
``GET /signals/data/{signal_def_id}``).

Orchestrator handler template
-------------------------------
    if tool_name.startswith("render_"):
        await ws_manager.broadcast("ui_render", {
            "agent": agent_id,
            "component": tool_name.removeprefix("render_"),
            "props": args,
            "turn_id": turn_id,
        })
        tool_result = {
            "type": "tool_result",
            "tool_use_id": tu_id,
            "content": "rendered",
        }
        # no DB access, no side-effect
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# Individual tool schemas
# ---------------------------------------------------------------------------

RENDER_SIGNAL_CHART: dict[str, Any] = {
    "name": "render_signal_chart",
    "description": (
        "Render an inline time-series chart for one or more process signals. "
        "Use this when a numeric trend, peak, or anomaly is more legible as a "
        "chart than as text. "
        "The frontend fetches the actual time-series data from the signals REST "
        "API using the provided signal_def_id and the window derived from "
        "window_hours. No raw data is passed in the call."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "cell_id": {
                "type": "integer",
                "description": "Production cell the signal belongs to (used for frontend routing).",
            },
            "signal_def_id": {
                "type": "integer",
                "description": "Primary signal to display.",
            },
            "window_hours": {
                "type": "number",
                "description": "How many hours of history to show (e.g. 24).",
                "default": 24,
            },
            "mark_anomaly_at": {
                "type": "string",
                "format": "date-time",
                "description": "Optional ISO-8601 timestamp; the chart marks a vertical line at this point.",
            },
            "threshold": {
                "type": "number",
                "description": "Optional alert threshold to render as a horizontal rule.",
            },
            "predicted_breach_hours": {
                "type": "number",
                "description": (
                    "Optional server-computed hours until the signal is forecast to "
                    "cross its threshold at the current drift rate. Populated by "
                    "the orchestrator from the forecast-watch regression; the "
                    "frontend also computes a local projection but will defer to "
                    "this value if provided."
                ),
            },
            "trend": {
                "type": "string",
                "enum": ["rising", "falling", "flat", "unknown"],
                "description": (
                    "Optional server-computed trend direction of the recent tail. "
                    "The frontend uses it as the trend caption instead of its "
                    "local estimate when present."
                ),
            },
        },
        "required": ["cell_id", "signal_def_id"],
        # Permit server-side enrichment fields (``predicted_breach_hours``,
        # ``trend``) that the orchestrator injects after the LLM tool call.
        # See :func:`agents.investigator.service.handle_render` and
        # :func:`agents.qa.tool_dispatch.handle_render`.
        "additionalProperties": True,
    },
}

RENDER_EQUIPMENT_KB_CARD: dict[str, Any] = {
    "name": "render_equipment_kb_card",
    "description": (
        "Render a structured card showing the equipment knowledge-base entry "
        "for the given cell. Use this when presenting thresholds, component "
        "specs, or calibration history is more actionable than prose."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "cell_id": {
                "type": "integer",
                "description": "Production cell whose KB entry to display.",
            },
            "highlight_fields": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional list of dot-path field names to visually highlight (e.g. ['thresholds.vibration_mm_s.alert']).",
            },
        },
        "required": ["cell_id"],
        "additionalProperties": False,
    },
}

RENDER_WORK_ORDER_CARD: dict[str, Any] = {
    "name": "render_work_order_card",
    "description": (
        "Render a formatted work-order card. Use this immediately after "
        "creating or referencing a work order so the operator can see it "
        "in-line without navigating away from the chat."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "cell_id": {
                "type": "integer",
                "description": "Production cell the work order is linked to.",
            },
            "work_order_id": {
                "type": "integer",
                "description": "ID of the work order to render.",
            },
            "printable": {
                "type": "boolean",
                "description": "If true, render a print-optimised layout.",
                "default": False,
            },
        },
        "required": ["cell_id", "work_order_id"],
        "additionalProperties": False,
    },
}

RENDER_DIAGNOSTIC_CARD: dict[str, Any] = {
    "name": "render_diagnostic_card",
    "description": (
        "Render a structured diagnostic card summarising an RCA conclusion. "
        "Call this at the end of an investigation to present the root cause, "
        "confidence, and contributing factors as a visual card rather than "
        "a text block."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "cell_id": {
                "type": "integer",
                "description": "Production cell the diagnosis applies to.",
            },
            "title": {
                "type": "string",
                "description": "Short title for the diagnostic card (e.g. 'Bearing wear — stage 2').",
            },
            "confidence": {
                "type": "number",
                "minimum": 0,
                "maximum": 1,
                "description": "Confidence level between 0 and 1.",
            },
            "root_cause": {
                "type": "string",
                "description": "Single-sentence root cause statement.",
            },
            "contributing_factors": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Ordered list of contributing factors (most to least significant).",
                "minItems": 1,
            },
            "pattern_match_id": {
                "type": "integer",
                "description": "Optional reference to a historical pattern match that supports this diagnosis.",
            },
        },
        "required": ["cell_id", "title", "confidence", "root_cause", "contributing_factors"],
        "additionalProperties": False,
    },
}

RENDER_PATTERN_MATCH: dict[str, Any] = {
    "name": "render_pattern_match",
    "description": (
        "Render a side-by-side comparison of the current anomaly event against "
        "a similar historical event. Use this when a past failure pattern "
        "strongly matches the current situation to support the diagnosis. "
        "The orchestrator will server-side enrich the call with predictive "
        "fields (``predicted_mttf_hours``, ``recommended_action``, "
        "``past_event_date``) derived from ``failure_history`` if absent."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "cell_id": {
                "type": "integer",
                "description": "Production cell where both events occurred.",
            },
            "current_event": {
                "type": "string",
                "description": "Human-readable description of the current anomaly event.",
            },
            "past_event_ref": {
                "type": "string",
                "description": "Reference to the historical event (e.g. failure_history id or date label).",
            },
            "similarity": {
                "type": "number",
                "minimum": 0,
                "maximum": 1,
                "description": "Similarity score between 0 and 1.",
            },
            "predicted_mttf_hours": {
                "type": "number",
                "description": (
                    "Optional estimated hours to failure based on the matched past "
                    "incident's time-to-resolution. Populated by the orchestrator "
                    "if absent."
                ),
            },
            "recommended_action": {
                "type": "string",
                "description": (
                    "Optional one-line preventive action the operator should take "
                    "now. Populated by the orchestrator from the past incident's "
                    "resolution if absent."
                ),
            },
            "past_event_date": {
                "type": "string",
                "format": "date-time",
                "description": (
                    "Optional ISO-8601 timestamp of the past incident. Populated "
                    "by the orchestrator from ``failure_history.failure_time`` if "
                    "absent."
                ),
            },
        },
        "required": ["cell_id", "current_event", "past_event_ref", "similarity"],
        # Permit server-side enrichment fields injected by the orchestrator
        # after the LLM tool call. See :func:`enrich_render_args` in
        # :mod:`agents.investigator.service`.
        "additionalProperties": True,
    },
}

RENDER_BAR_CHART: dict[str, Any] = {
    "name": "render_bar_chart",
    "description": (
        "Render a simple bar chart for any categorical comparison "
        "(e.g. downtime per category, quality rate per shift). "
        "Use this instead of a table when visual comparison improves readability."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Chart title.",
            },
            "x_label": {
                "type": "string",
                "description": "Label for the x-axis (category axis).",
            },
            "y_label": {
                "type": "string",
                "description": "Label for the y-axis (value axis).",
            },
            "bars": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "value": {"type": "number"},
                    },
                    "required": ["label", "value"],
                },
                "minItems": 1,
                "description": "Data series — one object per bar.",
            },
            "cell_id": {
                "type": "integer",
                "description": "Optional: production cell this chart relates to. Include when the data is cell-specific to enable frontend routing.",
            },
        },
        "required": ["title", "x_label", "y_label", "bars"],
        "additionalProperties": False,
    },
}

RENDER_KB_PROGRESS: dict[str, Any] = {
    "name": "render_kb_progress",
    "description": (
        "Render a step-by-step progress tracker for the KB Builder workflow. "
        "Call this at each phase transition so the operator can see which "
        "analysis steps have completed."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "cell_id": {
                "type": "integer",
                "description": "Production cell whose KB is being built.",
            },
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "status": {
                            "type": "string",
                            "enum": ["pending", "in_progress", "done", "skipped"],
                        },
                    },
                    "required": ["label", "status"],
                },
                "minItems": 1,
                "description": "Ordered list of KB-building steps with their current status.",
            },
        },
        "required": ["cell_id", "steps"],
        "additionalProperties": False,
    },
}

# ---------------------------------------------------------------------------
# render_alert_banner — NOT an LLM tool
#
# Sentinel emits ui_render events for this component directly via
# ``ws_manager.broadcast(...)`` without a LLM loop.  This schema is exported
# for WSManager-side validation only.  Do NOT add it to any agent's
# tools_schema list — it will never be called by a language model.
# ---------------------------------------------------------------------------

ALERT_BANNER_SCHEMA: dict[str, Any] = {
    "name": "render_alert_banner",
    "description": (
        "NOT an LLM tool — emitted directly by Sentinel via ws_manager. "
        "Schema kept here for WSManager-side validation in M4 scope."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "cell_id": {
                "type": "integer",
                "description": "Production cell where the alert was triggered.",
            },
            "severity": {
                "type": "string",
                "enum": ["info", "alert", "trip"],
                "description": "Alert severity level.",
            },
            "message": {
                "type": "string",
                "description": "Human-readable alert message.",
            },
            "anomaly_id": {
                "type": "integer",
                "description": "Reference to the anomaly event that triggered this alert.",
            },
        },
        "required": ["cell_id", "severity", "message", "anomaly_id"],
        "additionalProperties": False,
    },
}

# ---------------------------------------------------------------------------
# Per-agent collections
#
# Concatenate the relevant list with the MCP tools before each Anthropic call:
#
#     tools = await mcp_client.get_tools_schema() + INVESTIGATOR_RENDER_TOOLS
# ---------------------------------------------------------------------------

INVESTIGATOR_RENDER_TOOLS: list[dict[str, Any]] = [
    RENDER_SIGNAL_CHART,
    RENDER_DIAGNOSTIC_CARD,
    RENDER_PATTERN_MATCH,
]

QA_RENDER_TOOLS: list[dict[str, Any]] = [
    RENDER_SIGNAL_CHART,
    RENDER_BAR_CHART,
    RENDER_EQUIPMENT_KB_CARD,
]

KB_BUILDER_RENDER_TOOLS: list[dict[str, Any]] = [
    RENDER_EQUIPMENT_KB_CARD,
    RENDER_KB_PROGRESS,
]

WORK_ORDER_GEN_RENDER_TOOLS: list[dict[str, Any]] = [
    RENDER_WORK_ORDER_CARD,
]

# All tools that agents can call (excludes ALERT_BANNER_SCHEMA — Sentinel only)
ALL_LLM_RENDER_TOOLS: list[dict[str, Any]] = [
    RENDER_SIGNAL_CHART,
    RENDER_EQUIPMENT_KB_CARD,
    RENDER_WORK_ORDER_CARD,
    RENDER_DIAGNOSTIC_CARD,
    RENDER_PATTERN_MATCH,
    RENDER_BAR_CHART,
    RENDER_KB_PROGRESS,
]
