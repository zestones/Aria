"""Threshold breach helper tests (M2.3 — single source of truth)."""

from __future__ import annotations

import pytest
from core.thresholds import evaluate_threshold, match_threshold_key_to_signal
from modules.kb.kb_schema import ThresholdValue


@pytest.mark.unit
def test_single_sided_alert_breach():
    t = ThresholdValue(nominal=2.2, alert=4.5, trip=7.1)
    r = evaluate_threshold(t, 5.0)
    assert r["breached"] is True
    assert r["severity"] == "alert"
    assert r["direction"] == "high"
    assert r["threshold_field"] == "alert"
    assert r["threshold_value"] == 4.5


@pytest.mark.unit
def test_single_sided_trip_takes_precedence_over_alert():
    t = ThresholdValue(alert=4.5, trip=7.1)
    r = evaluate_threshold(t, 8.0)
    assert r["severity"] == "trip"
    assert r["threshold_field"] == "trip"


@pytest.mark.unit
def test_single_sided_no_breach():
    t = ThresholdValue(alert=4.5, trip=7.1)
    r = evaluate_threshold(t, 3.0)
    assert r["breached"] is False
    assert r["severity"] is None
    assert r["direction"] is None


@pytest.mark.unit
def test_double_sided_low_alert():
    t = ThresholdValue(nominal=533, low_alert=480, high_alert=580)
    r = evaluate_threshold(t, 470)
    assert r["breached"] is True
    assert r["severity"] == "alert"
    assert r["direction"] == "low"
    assert r["threshold_field"] == "low_alert"
    assert r["threshold_value"] == 480


@pytest.mark.unit
def test_double_sided_high_alert():
    t = ThresholdValue(nominal=533, low_alert=480, high_alert=580)
    r = evaluate_threshold(t, 600)
    assert r["breached"] is True
    assert r["direction"] == "high"
    assert r["threshold_field"] == "high_alert"


@pytest.mark.unit
def test_double_sided_within_band_is_safe():
    t = ThresholdValue(nominal=533, low_alert=480, high_alert=580)
    assert evaluate_threshold(t, 533)["breached"] is False


@pytest.mark.unit
def test_p02_kb_keys_match_p02_signals():
    # Reproduces the kb_key → signal_def matching for P-02 seed (migration 007).
    signals = [
        ("Discharge Bearing Vibration", "vibration"),
        ("Bearing Temperature", "temperature"),
        ("Discharge Flow Rate", "flow"),
        ("Discharge Pressure", "pressure"),
    ]
    expected = {
        "vibration_mm_s": "Discharge Bearing Vibration",
        "bearing_temp_c": "Bearing Temperature",
        "flow_l_min": "Discharge Flow Rate",
        "pressure_bar": "Discharge Pressure",
    }
    for kb_key, expected_display in expected.items():
        scores = [
            (display, match_threshold_key_to_signal(kb_key, display, type_))
            for display, type_ in signals
        ]
        best = max(scores, key=lambda x: x[1])
        assert best[1] > 0, f"no match for {kb_key}"
        assert best[0] == expected_display, f"wrong match for {kb_key}: got {best}"
