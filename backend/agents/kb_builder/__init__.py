"""KB Builder agent — PDF extraction (M3.2) + onboarding session (M3.3).

The package is split by concern:

- :mod:`agents.kb_builder.pdf_extraction` — Opus-vision extraction of an
  ``EquipmentKB`` from a PDF manual + ``bootstrap_thresholds`` to fill gaps.
- :mod:`agents.kb_builder.onboarding` — multi-turn onboarding session that
  calibrates the KB with operator answers (4 questions, Sonnet-backed patch
  extraction, MCP write).

Public symbols are re-exported here so callers can keep using
``from agents.kb_builder import ...``.
"""

from agents.kb_builder.onboarding import (
    OnboardingPatch,
    OnboardingSession,
    start_onboarding,
    submit_onboarding_message,
)
from agents.kb_builder.pdf_extraction import bootstrap_thresholds, extract_from_pdf

__all__ = [
    "OnboardingPatch",
    "OnboardingSession",
    "bootstrap_thresholds",
    "extract_from_pdf",
    "start_onboarding",
    "submit_onboarding_message",
]
