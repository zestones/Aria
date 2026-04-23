"""Sonnet-backed patch extraction with one-shot Pydantic-validated retry.

Operator answers are free text; this module hands them to Sonnet with a
schema hint and validates the response against
:class:`~agents.kb_builder.onboarding.questions.OnboardingPatch` before
returning a dict that is safe to pass to ``update_equipment_kb``.

If the first attempt produces a malformed or wrong-typed patch (Sonnet
occasionally emits ``{"alert": "high"}`` instead of a float), the function
re-prompts Sonnet once with the validation error attached. After two
failures the underlying ``ValidationError`` / ``ValueError`` propagates so
the caller can keep the session at the same ``question_index`` and let the
operator re-answer.
"""

from __future__ import annotations

import json
import logging
from typing import Any, cast

from agents.anthropic_client import anthropic, model_for, parse_json_response
from agents.kb_builder.onboarding.questions import OnboardingPatch
from anthropic.types import MessageParam, TextBlock
from pydantic import ValidationError

log = logging.getLogger("aria.kb_builder.onboarding.extraction")


_PATCH_SYSTEM = (
    "You receive a free-text answer from a machine operator about an industrial "
    "pump. Extract structured values as a JSON patch matching this hint: {hint}. "
    "If you cannot extract a value, set it to null or omit the field. "
    "Return ONLY valid JSON — no preamble, no explanation, no markdown fences."
)


def _first_text(content: list[Any]) -> str:
    """Return the first ``TextBlock.text`` from a Claude response, or ''."""
    return next(
        (block.text for block in content if isinstance(block, TextBlock)),
        "",
    )


async def extract_patch(answer: str, hint: str, cell_id: int) -> dict:
    """Ask Sonnet to extract a structured patch; retry once on validation error.

    Args:
        answer: Operator's free-text answer.
        hint: Schema hint for this specific question (see
            :data:`~agents.kb_builder.onboarding.questions.QUESTIONS`).
        cell_id: For log context only.

    Returns:
        ``patch.model_dump(exclude_none=True)`` — safe to feed straight to
        ``update_equipment_kb``.

    Raises:
        ValidationError: When both the first call AND the retry produce an
            invalid patch. Caller surfaces as HTTP 422.
        ValueError: When neither response contains parseable JSON.
    """
    response = await anthropic.messages.create(
        model=model_for("extraction"),
        max_tokens=1024,
        system=_PATCH_SYSTEM.format(hint=hint),
        messages=[{"role": "user", "content": answer}],
    )
    log.info(
        "extract_patch: tokens input=%d output=%d (cell=%d)",
        response.usage.input_tokens,
        response.usage.output_tokens,
        cell_id,
    )
    raw_text = _first_text(response.content)

    try:
        raw = parse_json_response(response)
        patch = OnboardingPatch.model_validate(raw)
        return patch.model_dump(exclude_none=True)
    except (ValueError, ValidationError, json.JSONDecodeError) as first_err:
        first_err_msg = str(first_err)
        log.warning(
            "extract_patch: first parse failed (cell=%d): %s — retrying",
            cell_id,
            first_err_msg,
        )

    retry_messages: list[MessageParam] = [
        cast(MessageParam, {"role": "user", "content": answer}),
        cast(MessageParam, {"role": "assistant", "content": raw_text or "{}"}),
        cast(
            MessageParam,
            {
                "role": "user",
                "content": (
                    f"Validation failed: {first_err_msg}. Return corrected JSON only \u2014 "
                    "no preamble, no explanation, no fences."
                ),
            },
        ),
    ]
    retry = await anthropic.messages.create(
        model=model_for("extraction"),
        max_tokens=1024,
        system=_PATCH_SYSTEM.format(hint=hint),
        messages=retry_messages,
    )
    log.info(
        "extract_patch: retry tokens input=%d output=%d (cell=%d)",
        retry.usage.input_tokens,
        retry.usage.output_tokens,
        cell_id,
    )
    raw = parse_json_response(retry)
    patch = OnboardingPatch.model_validate(raw)
    return patch.model_dump(exclude_none=True)
