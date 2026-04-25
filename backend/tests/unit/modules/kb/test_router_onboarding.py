"""Unit coverage for onboarding router error mapping."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from modules.kb import router as kb_router
from modules.kb.schemas import OnboardingMessageIn


@pytest.mark.unit
@pytest.mark.asyncio
async def test_onboarding_message_maps_extraction_error_to_422(
    monkeypatch: pytest.MonkeyPatch,
):
    async def _boom(_session_id: str, _answer: str) -> dict:
        raise ValueError("bad patch")

    monkeypatch.setattr(kb_router, "submit_onboarding_message", _boom)

    with pytest.raises(HTTPException) as exc_info:
        await kb_router.onboarding_message(
            5,
            OnboardingMessageIn(session_id="session-1", answer="operator answer"),
        )

    assert exc_info.value.status_code == 422
    assert "Onboarding extraction failed after retry" in exc_info.value.detail
