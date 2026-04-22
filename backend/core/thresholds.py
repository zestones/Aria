"""Threshold breach evaluation — single source of truth for ARIA.

The ``equipment_kb.structured_data.thresholds`` blob supports two shapes
(see ``modules.kb.kb_schema.ThresholdValue``):

- single-sided:  ``alert`` / ``trip`` (vibration, temperature)
- double-sided:  ``low_alert`` / ``high_alert`` (flow, pressure)

This helper unifies breach detection so MCP tools (M2.3 ``get_signal_anomalies``)
and Sentinel (M4.2) report identically.
"""

from __future__ import annotations

from typing import Literal, Optional, TypedDict

from modules.kb.kb_schema import ThresholdValue


class BreachResult(TypedDict):
    breached: bool
    severity: Optional[Literal["alert", "trip"]]
    direction: Optional[Literal["high", "low"]]
    threshold_field: Optional[str]
    threshold_value: Optional[float]


def evaluate_threshold(threshold: ThresholdValue, value: float) -> BreachResult:
    """Return whether ``value`` breaches any bound on ``threshold``.

    Precedence (highest severity wins): ``trip`` > ``high_alert`` > ``alert`` > ``low_alert``.
    A non-breach returns all-null fields with ``breached=False``.
    """
    # Single-sided: trip first (highest severity)
    if threshold.trip is not None and value >= threshold.trip:
        return {
            "breached": True,
            "severity": "trip",
            "direction": "high",
            "threshold_field": "trip",
            "threshold_value": threshold.trip,
        }
    # Double-sided: high_alert
    if threshold.high_alert is not None and value >= threshold.high_alert:
        return {
            "breached": True,
            "severity": "alert",
            "direction": "high",
            "threshold_field": "high_alert",
            "threshold_value": threshold.high_alert,
        }
    # Single-sided: alert
    if threshold.alert is not None and value >= threshold.alert:
        return {
            "breached": True,
            "severity": "alert",
            "direction": "high",
            "threshold_field": "alert",
            "threshold_value": threshold.alert,
        }
    # Double-sided: low_alert
    if threshold.low_alert is not None and value <= threshold.low_alert:
        return {
            "breached": True,
            "severity": "alert",
            "direction": "low",
            "threshold_field": "low_alert",
            "threshold_value": threshold.low_alert,
        }
    return {
        "breached": False,
        "severity": None,
        "direction": None,
        "threshold_field": None,
        "threshold_value": None,
    }
