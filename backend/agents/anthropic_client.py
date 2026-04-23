"""Anthropic SDK singleton + helpers shared across all ARIA agents.

The module exposes:

- ``anthropic`` — process-wide ``AsyncAnthropic`` client. Built once at import
  time so a missing ``ANTHROPIC_API_KEY`` raises a clear startup error via
  Pydantic settings (acceptance criterion of M3.1).
- ``model_for(use_case)`` — maps a use case to the correct Claude model slug.
  Investigator/vision use Opus, everything else uses Sonnet.
- ``parse_json_response(message)`` — best-effort JSON extraction from Claude's
  free-text responses (handles raw JSON, ``json`` fences, and JSON preceded by
  preamble text).

Note: callers needing streaming (``M4.5`` Investigator extended thinking) must
hit ``anthropic.messages.create(stream=True)`` directly on the singleton — do
not introduce a wrapper that forces ``stream=False``.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Literal

from anthropic import AsyncAnthropic
from anthropic.types import Message, TextBlock
from core.config import get_settings

log = logging.getLogger("aria.anthropic")

_settings = get_settings()

# Singleton — safe to share across coroutines (httpx.AsyncClient under the hood).
anthropic = AsyncAnthropic(
    api_key=_settings.anthropic_api_key,
    timeout=60.0,
    max_retries=2,
)

_SONNET = "claude-sonnet-4-5"
_OPUS = "claude-opus-4-7"


# TODO: decide wether using only opus 4.7 or not even for simple extraction and chat
def model_for(use_case: Literal["extraction", "vision", "reasoning", "chat"]) -> str:
    """Return the model slug for a given use case, respecting ``ARIA_MODEL``.

    Routing table:

    | use_case    | ARIA_MODEL=sonnet | ARIA_MODEL=opus |
    |-------------|-------------------|-----------------|
    | vision      | Sonnet            | Opus            |
    | reasoning   | Sonnet            | Opus            |
    | extraction  | Sonnet            | Sonnet          |
    | chat        | Sonnet            | Sonnet          |

    ``extraction`` and ``chat`` are ALWAYS Sonnet regardless of ``ARIA_MODEL``
    — there is no quality gain from Opus for free-text patch extraction or
    KB Builder Q&A, only ~10x cost.

    Switch for demo day:  ``ARIA_MODEL=opus`` in ``.env`` or Docker env.
    Revert for dev:       ``ARIA_MODEL=sonnet`` (default).
    """
    if use_case in ("vision", "reasoning") and _settings.aria_model == "opus":
        return _OPUS
    return _SONNET


_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```")
_BRACE_RE = re.compile(r"\{[\s\S]*\}")


def parse_json_response(response: Message) -> dict[str, Any]:
    """Extract the first JSON object from a Claude ``Message``.

    Handles three shapes Claude tends to emit:

    1. Raw JSON.
    2. JSON wrapped in ``json`` (or bare ``  ``) fences.
    3. JSON preceded by preamble text (``Here's the answer:\\n\\n{...}``).

    Raises ``ValueError`` if no valid JSON is found.
    """
    text = next(
        (block.text for block in response.content if isinstance(block, TextBlock)),
        None,
    )
    if not text:
        raise ValueError("no text block in response")

    # 1. Direct parse.
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. Strip ```json ... ``` fences.
    fence = _FENCE_RE.search(text)
    if fence:
        try:
            return json.loads(fence.group(1).strip())
        except json.JSONDecodeError:
            pass

    # 3. Find the first ``{...}`` block (greedy — matches outermost braces).
    brace = _BRACE_RE.search(text)
    if brace:
        try:
            return json.loads(brace.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"could not parse JSON from response: {text[:200]}")
