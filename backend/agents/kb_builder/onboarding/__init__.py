"""Onboarding session subpackage (M3.3 — issue #19).

Splits the multi-turn onboarding flow into 4 focused modules:

- :mod:`agents.kb_builder.onboarding.questions` — the 4 hardcoded questions
  + the Pydantic ``OnboardingPatch`` shape Sonnet must emit.
- :mod:`agents.kb_builder.onboarding.session_store` — in-process session
  store, TTL sweep, drop helper.
- :mod:`agents.kb_builder.onboarding.extraction` — Sonnet patch extraction
  with one-shot Pydantic-validated retry.
- :mod:`agents.kb_builder.onboarding.service` — public ``start_onboarding`` /
  ``submit_onboarding_message`` orchestration.

Public symbols are re-exported here so callers can import from the package
root without knowing the internal layout.
"""

from agents.kb_builder.onboarding.questions import OnboardingPatch
from agents.kb_builder.onboarding.service import start_onboarding, submit_onboarding_message
from agents.kb_builder.onboarding.session_store import OnboardingSession

__all__ = [
    "OnboardingPatch",
    "OnboardingSession",
    "start_onboarding",
    "submit_onboarding_message",
]
