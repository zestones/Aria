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


def _tokenise(text: str) -> set[str]:
    """Lowercase + split on non-alphanumeric, drop tokens shorter than 3 chars."""
    out: set[str] = set()
    buf: list[str] = []
    for ch in text.lower():
        if ch.isalnum():
            buf.append(ch)
        else:
            if buf:
                token = "".join(buf)
                if len(token) >= 3:
                    out.add(token)
                buf = []
    if buf:
        token = "".join(buf)
        if len(token) >= 3:
            out.add(token)
    return out


def match_threshold_key_to_signal(
    kb_key: str,
    signal_display_name: str,
    signal_type_name: Optional[str] = None,
) -> int:
    """Best-effort fuzzy match — substring overlap between a KB threshold key
    (e.g. ``"bearing_temp_c"``) and a signal definition's display name +
    optional type name. Returns the overlap count (0 = no match).

    Uses substring containment so abbreviations match (e.g. ``temp`` ⊂
    ``temperature``). Mapping is heuristic because no explicit
    ``kb_key → signal_def_id`` column exists in the schema (see issue #10
    follow-up).
    """
    key_tokens = _tokenise(kb_key)
    sig_tokens = _tokenise(signal_display_name)
    if signal_type_name:
        sig_tokens |= _tokenise(signal_type_name)
    score = 0
    for kt in key_tokens:
        for st in sig_tokens:
            if kt == st or kt in st or st in kt:
                score += 1
                break
    return score
