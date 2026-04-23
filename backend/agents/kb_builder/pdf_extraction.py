"""PDF → ``EquipmentKB`` extraction (M3.2 — issue #18).

Two helpers used by ``modules/kb/router.py::upload_pdf``:

- :func:`extract_from_pdf` — Opus-vision extraction with one retry on
  parse / validation failure. Returns ``(EquipmentKB, raw_text)``.
- :func:`bootstrap_thresholds` — pre-fills any
  ``process_signal_definition.kb_threshold_key`` entry that Opus missed with a
  ``{alert: None, source: "pending_calibration", confidence: 0.0}`` stub. This
  keeps ``KbRepository._assert_thresholds_cover_signal_keys`` happy without
  blocking the operator on imperfect extractions (demo-breaker fix — see
  issue #18 §4).

The router calls them in order::

    kb, raw = await extract_from_pdf(bytes, cell_id)
    kb_dict = await bootstrap_thresholds(cell_id, kb.model_dump(exclude={"kb_meta"}))
    await mcp_client.call_tool("update_equipment_kb", {... raw_markdown=raw ...})
"""

from __future__ import annotations

import base64
import json
import logging
from io import BytesIO
from typing import Any, cast

from agents.anthropic_client import anthropic, model_for, parse_json_response
from anthropic.types import MessageParam, TextBlock
from core.database import db
from modules.kb.kb_schema import EquipmentKB
from pydantic import ValidationError
from pypdf import PdfReader

log = logging.getLogger("aria.kb_builder.pdf_extraction")


_MAX_PAGES = 50

_EXTRACTION_SYSTEM = """You are a maintenance knowledge extraction engine.
Extract structured data from the equipment manual below.
Return ONLY valid JSON — no preamble, no explanation.

Schema:
{
  "equipment": {
    "equipment_type": str | null,
    "manufacturer": str | null,
    "model": str | null,
    "motor_power_kw": float | null,
    "rpm_nominal": int | null,
    "service_description": str | null
  },
  "thresholds": {
    "<signal_key>": {
      "nominal": float | null,
      "alert": float | null,
      "trip": float | null,
      "low_alert": float | null,
      "high_alert": float | null,
      "unit": str | null,
      "source": "page/section citation",
      "confidence": 0.0-1.0
    }
  },
  "failure_patterns": [
    {"mode": str, "symptoms": str | null, "mtbf_months": int | null}
  ],
  "maintenance_procedures": [
    {"action": str, "interval_months": int | null, "duration_min": int | null, "parts": [str]}
  ]
}

Leave fields null if not found. Never guess."""


def _first_text(content: list[Any]) -> str:
    """Return the first ``TextBlock.text`` from a Claude response, or ''."""
    return next(
        (block.text for block in content if isinstance(block, TextBlock)),
        "",
    )


async def bootstrap_thresholds(cell_id: int, extracted: dict) -> dict:
    """Pre-fill missing ``kb_threshold_key`` entries with null-alert stubs.

    Ensures ``KbRepository._assert_thresholds_cover_signal_keys`` passes even
    when Opus vision misses a threshold. Stubs have ``alert=None`` so
    ``core.thresholds.evaluate_threshold`` returns ``breached=False`` —
    Sentinel silently skips them until operator calibration fills in real
    values. No M4.2 changes required.

    Args:
        cell_id: Target cell.
        extracted: Mutable KB dict (post ``EquipmentKB.model_dump``).

    Returns:
        The same dict with ``thresholds`` augmented (in-place + returned for
        ergonomics).
    """
    async with db.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT kb_threshold_key FROM process_signal_definition "
            "WHERE cell_id = $1 AND kb_threshold_key IS NOT NULL",
            cell_id,
        )
    required = {r["kb_threshold_key"] for r in rows}
    thresholds = dict(extracted.get("thresholds") or {})
    added: list[str] = []
    for key in required:
        if key not in thresholds:
            thresholds[key] = {
                "alert": None,
                "source": "pending_calibration",
                "confidence": 0.0,
            }
            added.append(key)
    extracted["thresholds"] = thresholds
    if added:
        log.info(
            "bootstrap_thresholds: cell=%d filled %d missing key(s): %s",
            cell_id,
            len(added),
            sorted(added),
        )
    return extracted


async def extract_from_pdf(pdf_bytes: bytes, cell_id: int) -> tuple[EquipmentKB, str]:
    """Extract a structured KB from a PDF manual using Opus vision.

    Uses Anthropic's ``document`` content block (base64 PDF) so Opus reads the
    file natively — no OCR step. Retries once with the validation error fed
    back to the model when the first response fails Pydantic validation or
    JSON parsing.

    Args:
        pdf_bytes: Raw PDF bytes (already read from ``UploadFile``).
        cell_id: Target cell — used only for log context.

    Returns:
        Tuple of ``(EquipmentKB, raw_text)``. ``raw_text`` is the first
        ``TextBlock`` from the (possibly retried) successful response and is
        intended for storage in ``equipment_kb.raw_markdown``.

    Raises:
        ValueError: When the PDF exceeds ``_MAX_PAGES`` (50). Router maps to
            HTTP 413.
        ValueError | ValidationError: When the second extraction attempt also
            fails. Router maps to HTTP 422.
    """
    reader = PdfReader(BytesIO(pdf_bytes))
    page_count = len(reader.pages)
    if page_count > _MAX_PAGES:
        raise ValueError(
            f"PDF has {page_count} pages; limit is {_MAX_PAGES}. "
            "Pre-cut to specs + maintenance + troubleshooting sections."
        )

    log.info("extract_from_pdf: cell=%d pages=%d bytes=%d", cell_id, page_count, len(pdf_bytes))

    b64 = base64.standard_b64encode(pdf_bytes).decode()
    # Cast: Anthropic's MessageParam is a strict TypedDict union; the document
    # block shape is correct at runtime but pyright cannot narrow the literal
    # ``"type": "document"`` through a nested dict literal.
    user_msg = cast(
        MessageParam,
        {
            "role": "user",
            "content": [
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": b64,
                    },
                },
                {
                    "type": "text",
                    "text": "Extract the equipment knowledge base from this manual.",
                },
            ],
        },
    )

    response = await anthropic.messages.create(
        model=model_for("vision"),
        max_tokens=8192,
        system=_EXTRACTION_SYSTEM,
        messages=[user_msg],
    )
    log.info(
        "extract_from_pdf: tokens input=%d output=%d (cell=%d)",
        response.usage.input_tokens,
        response.usage.output_tokens,
        cell_id,
    )
    raw_text = _first_text(response.content)

    try:
        kb = EquipmentKB.model_validate(parse_json_response(response))
        return kb, raw_text
    except (ValueError, ValidationError, json.JSONDecodeError) as first_err:
        first_err_msg = str(first_err)
        log.warning(
            "extract_from_pdf: first parse failed (cell=%d): %s — retrying",
            cell_id,
            first_err_msg,
        )

    retry_messages: list[MessageParam] = [
        user_msg,
        cast(MessageParam, {"role": "assistant", "content": raw_text}),
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
        model=model_for("vision"),
        max_tokens=8192,
        system=_EXTRACTION_SYSTEM,
        messages=retry_messages,
    )
    log.info(
        "extract_from_pdf: retry tokens input=%d output=%d (cell=%d)",
        retry.usage.input_tokens,
        retry.usage.output_tokens,
        cell_id,
    )
    retry_text = _first_text(retry.content)
    kb = EquipmentKB.model_validate(parse_json_response(retry))
    return kb, retry_text
