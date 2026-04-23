"""Onboarding question catalogue + Sonnet patch shape.

The 4 questions are intentionally hardcoded for the hackathon scope:
they are tuned to the fields ``EquipmentKB`` exposes and to the demo flow
(scenes 1 → 5). See issue #19 §5.

If you need to add or reorder questions, update ``_QUESTIONS`` here only —
``service.submit_onboarding_message`` indexes into it through
``session.question_index``.
"""

from __future__ import annotations

from typing import Any

from modules.kb.kb_schema import EquipmentMeta, FailurePattern, ThresholdValue
from pydantic import BaseModel

# The 4 questions. ``patch_hint`` is the short instruction Sonnet receives
# alongside the operator's free-text answer so the extracted patch lands on
# the right ``EquipmentKB`` field.
QUESTIONS: list[dict[str, Any]] = [
    {
        "index": 0,
        # Q1 is templated by ``service._render_q1`` with the manufacturer's
        # vibration threshold extracted from the PDF (``{mfr_value}`` →
        # ``"4.5 mm/s"``). When the value is unknown, the placeholder phrase
        # ``"the manufacturer's value"`` is substituted instead so the
        # question remains grammatical.
        "text": (
            "I extracted {mfr_value} as the vibration threshold from the manual. "
            "What value (mm/s) do you normally observe on this pump in "
            "steady-state operation?"
        ),
        "patch_hint": (
            "thresholds.vibration_mm_s — update nominal and derive alert as nominal * 1.8"
        ),
    },
    {
        "index": 1,
        "text": (
            "When was the last bearing replacement, and how many operating " "hours since then?"
        ),
        "patch_hint": "failure_patterns — update mtbf_months estimate based on bearing age",
    },
    {
        "index": 2,
        "text": (
            "What recurring failures or abnormal behaviours have you observed " "on this equipment?"
        ),
        "patch_hint": "failure_patterns — add or update known failure modes",
    },
    {
        "index": 3,
        "text": (
            "Are there any special installation conditions (ambient temperature, "
            "humidity, vibration from nearby equipment)?"
        ),
        "patch_hint": "equipment — update service_description with installation context",
    },
]


class OnboardingPatch(BaseModel):
    """Validated shape of the JSON patch Sonnet emits per question.

    Matches the subset of ``EquipmentKB`` operators can mutate during
    onboarding. Any extra keys Sonnet hallucinates are dropped on
    ``model_dump(exclude_none=True)``. Wrong-typed leaves (e.g.
    ``{"alert": "high"}``) raise ``ValidationError`` which the caller turns
    into a one-shot Sonnet retry.
    """

    thresholds: dict[str, ThresholdValue] | None = None
    equipment: EquipmentMeta | None = None
    failure_patterns: list[FailurePattern] | None = None
