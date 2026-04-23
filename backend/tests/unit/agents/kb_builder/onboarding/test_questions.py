"""``OnboardingPatch`` shape validation (M3.3 — issue #19 acceptance #7).

Sonnet is allowed to emit bad types occasionally (``{"alert": "high"}`` is
the canonical case). The Pydantic gate must reject those before they hit
``update_equipment_kb`` so the orchestrator can re-prompt with a clear
validation error.
"""

from __future__ import annotations

import pytest
from agents.kb_builder.onboarding.questions import QUESTIONS, OnboardingPatch
from pydantic import ValidationError


@pytest.mark.unit
def test_questions_catalogue_has_expected_shape():
    assert len(QUESTIONS) == 4
    for i, q in enumerate(QUESTIONS):
        assert q["index"] == i
        assert "{mfr_value}" in q["text"] or "?" in q["text"]
        assert q["patch_hint"]
    # Q1 is templated with the manufacturer value extracted from the PDF.
    assert "{mfr_value}" in QUESTIONS[0]["text"]


@pytest.mark.unit
def test_patch_accepts_valid_threshold_update():
    patch = OnboardingPatch.model_validate(
        {"thresholds": {"vibration_mm_s": {"nominal": 2.4, "alert": 4.3}}}
    )
    dumped = patch.model_dump(exclude_none=True)
    assert dumped["thresholds"]["vibration_mm_s"]["alert"] == 4.3
    # equipment / failure_patterns absent → omitted on dump.
    assert "equipment" not in dumped
    assert "failure_patterns" not in dumped


@pytest.mark.unit
def test_patch_rejects_string_threshold_value():
    # The exact failure mode flagged in issue #19 §6.
    with pytest.raises(ValidationError):
        OnboardingPatch.model_validate({"thresholds": {"vibration_mm_s": {"alert": "high"}}})


@pytest.mark.unit
def test_patch_rejects_failure_pattern_missing_mode():
    # ``mode`` is the only required field on FailurePattern.
    with pytest.raises(ValidationError):
        OnboardingPatch.model_validate({"failure_patterns": [{"symptoms": "noise"}]})


@pytest.mark.unit
def test_patch_drops_unknown_top_level_keys_via_exclude_none():
    # Unknown top-level keys are silently dropped (Pydantic v2 default
    # ``extra="ignore"``) so a hallucinated key never reaches the MCP write.
    patch = OnboardingPatch.model_validate(
        {"thresholds": None, "garbage_key": {"x": 1}},
    )
    dumped = patch.model_dump(exclude_none=True)
    assert "garbage_key" not in dumped
    assert "thresholds" not in dumped  # was None, exclude_none drops it


@pytest.mark.unit
def test_patch_accepts_equipment_and_failure_patterns_together():
    patch = OnboardingPatch.model_validate(
        {
            "equipment": {"service_description": "Ambient 40°C, near compressor"},
            "failure_patterns": [{"mode": "bearing wear", "mtbf_months": 18}],
        }
    )
    dumped = patch.model_dump(exclude_none=True)
    assert dumped["equipment"]["service_description"].startswith("Ambient")
    assert dumped["failure_patterns"][0]["mode"] == "bearing wear"
