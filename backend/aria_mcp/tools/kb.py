"""KB tools (M2.5) — read KB, read failure history, calibrated KB writes.

The 3 tools surface ``equipment_kb`` to the agents:

- ``get_equipment_kb(cell_id)``         → parsed ``structured_data`` dict.
- ``get_failure_history(cell_id, ...)`` → past failures for pattern matching.
- ``update_equipment_kb(...)``          → **the only shared write tool in M2**.

Write contract (audit M2.5 §1-§3):

1. ``structured_data_patch`` follows RFC-7396 JSON Merge Patch semantics.
   See ``modules.kb.merge.merge_structured_data``. Three canonical cases
   (leaf, subtree, ``null`` deletion) are covered by unit tests.
2. ``structured_data.calibration_log`` is **exempt** from merge — every write
   appends one ``{timestamp, source, calibrated_by, patch_summary}`` entry.
3. The tool auto-bumps ``kb_meta.version``, recomputes
   ``kb_meta.completeness_score`` (and the column ``confidence_score``),
   refreshes ``kb_meta.last_calibrated_by`` and the column ``last_enriched_at``.
   Callers MUST NOT bump these themselves.

Audit M2.5 §4 (broadcast on write): deferred to M8.2 (issue #46) — no
``ws_manager`` infrastructure exists in the repo today and a single-event
WS scaffold here would be over-engineering. The M8.2 implementer must add
``await ws_manager.broadcast("kb_updated", {"cell_id": cell_id, "version":
kb_meta["version"]})`` at the end of ``update_equipment_kb`` (search this
file for ``audit M2.5 §4`` to find the exact insertion point).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from aria_mcp._common import with_conn
from aria_mcp.server import mcp
from core.exceptions import NotFoundError
from modules.kb.kb_schema import EquipmentKB
from modules.kb.merge import merge_structured_data
from modules.kb.repository import KbRepository


def _decode_structured_data(raw: Any) -> dict:
    """Normalise ``structured_data`` to a dict.

    asyncpg returns jsonb as ``str`` when no codec is registered (audit §5).
    Tolerate both ``str`` and dict so this works regardless of future codec
    registration.
    """
    if raw is None:
        return {}
    if isinstance(raw, str):
        return json.loads(raw)
    if isinstance(raw, dict):
        return raw
    raise TypeError(f"unexpected structured_data type: {type(raw).__name__}")


def _patch_summary(patch: dict[str, Any]) -> dict[str, Any]:
    """Compact summary of a patch for the calibration_log entry.

    Stores leaf paths (e.g. ``thresholds.vibration_mm_s.alert``) without their
    new values to keep the log readable — the full patch is reconstructible
    by diffing two adjacent versions if needed.
    """
    paths: list[str] = []

    def _walk(node: Any, prefix: str) -> None:
        if isinstance(node, dict):
            for k, v in node.items():
                _walk(v, f"{prefix}.{k}" if prefix else k)
        else:
            paths.append(prefix)

    _walk(patch, "")
    return {"paths": paths, "count": len(paths)}


@mcp.tool()
async def get_equipment_kb(cell_id: int) -> dict:
    """Return the parsed ``equipment_kb`` row for a cell.

    Args:
        cell_id: Target cell.

    Returns:
        ``{cell_id, equipment_type, manufacturer, model, installation_date,
        structured_data: dict, confidence_score, last_enriched_at,
        onboarding_complete, last_updated_by, last_updated_at}``.
        ``structured_data`` is the parsed JSON object (audit §5), never the
        raw asyncpg string.

    Raises:
        ValueError: When no ``equipment_kb`` row exists for the cell.
    """
    async with with_conn() as conn:
        row = await KbRepository(conn).get_by_cell(cell_id)
    if row is None:
        raise ValueError(f"no equipment_kb row for cell {cell_id}")
    structured = _decode_structured_data(row["structured_data"])
    return {
        "cell_id": row["cell_id"],
        "cell_name": row["cell_name"],
        "equipment_type": row["equipment_type"],
        "manufacturer": row["manufacturer"],
        "model": row["model"],
        "installation_date": (
            row["installation_date"].isoformat() if row["installation_date"] else None
        ),
        "structured_data": structured,
        "confidence_score": float(row["confidence_score"] or 0.0),
        "last_enriched_at": (
            row["last_enriched_at"].isoformat() if row["last_enriched_at"] else None
        ),
        "onboarding_complete": bool(row["onboarding_complete"]),
        "last_updated_by": row["last_updated_by"],
        "last_updated_at": row["last_updated_at"].isoformat(),
    }


@mcp.tool()
async def get_failure_history(cell_id: int, limit: int = 50) -> list[dict]:
    """Past failures for a cell, newest first.

    Args:
        cell_id: Target cell.
        limit: Max rows (default 50, capped at 1000).

    Returns:
        List of failure rows including parsed ``parts_replaced`` and
        ``signal_patterns`` JSON columns.
    """
    capped = max(1, min(limit, 1000))
    async with with_conn() as conn:
        rows = await KbRepository(conn).list_failures(cell_id, capped)
    out: list[dict] = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "cell_id": r["cell_id"],
                "cell_name": r["cell_name"],
                "failure_time": r["failure_time"].isoformat(),
                "resolved_time": (r["resolved_time"].isoformat() if r["resolved_time"] else None),
                "failure_mode": r["failure_mode"],
                "root_cause": r["root_cause"],
                "resolution": r["resolution"],
                "parts_replaced": (
                    _decode_structured_data(r["parts_replaced"])
                    if r["parts_replaced"] is not None
                    else None
                ),
                "downtime_minutes": r["downtime_minutes"],
                "cost_estimate": (
                    float(r["cost_estimate"]) if r["cost_estimate"] is not None else None
                ),
                "work_order_id": r["work_order_id"],
                "signal_patterns": (
                    _decode_structured_data(r["signal_patterns"])
                    if r["signal_patterns"] is not None
                    else None
                ),
                "created_at": r["created_at"].isoformat(),
            }
        )
    return out


@mcp.tool()
async def update_equipment_kb(
    cell_id: int,
    structured_data_patch: dict,
    source: str,
    calibrated_by: str,
    raw_markdown: str | None = None,
    onboarding_complete: bool | None = None,
) -> dict:
    """Apply an RFC-7396 patch to ``equipment_kb.structured_data``.

    Audit M2.5 §1-§3 contract:

    - ``structured_data_patch`` is merged via RFC-7396 (recursive dict merge,
      arrays replace, ``null`` deletes). See ``modules.kb.merge``.
    - ``calibration_log`` is exempt from merge — one entry is appended per
      call (timestamp, source, calibrated_by, patch_summary).
    - ``kb_meta.version`` is incremented (+1).
    - ``kb_meta.completeness_score`` and the column ``confidence_score`` are
      recomputed via ``EquipmentKB.compute_completeness()``.
    - ``kb_meta.last_calibrated_by`` and the column ``last_enriched_at`` are
      refreshed.
    - The repository's ``_assert_thresholds_cover_signal_keys`` guard runs on
      the merged document (issue #69 — partial patches must not orphan a
      ``process_signal_definition.kb_threshold_key``).

    Args:
        cell_id: Target cell. Must already have an ``equipment_kb`` row.
        structured_data_patch: Partial structured_data patch. Pass a nested
            object — e.g. ``{"thresholds": {"vibration_mm_s": {"alert": 6.5}}}``
            replaces only that leaf. Pass ``null`` to delete a key.
        source: Origin of the patch (``"pdf_extraction"``, ``"operator_ui"``,
            ``"investigator_agent"``, ...). Recorded in ``calibration_log``.
        calibrated_by: User or agent identifier. Recorded in ``calibration_log``
            and on ``kb_meta.last_calibrated_by``. Trusted from the orchestrating
            code per the issue's Option-A decision; will be JWT-injected
            post-hackathon.
        raw_markdown: Optional raw extraction text (e.g. the Opus-vision JSON
            response from a PDF upload). Stored in ``equipment_kb.raw_markdown``
            for later auditing / reprocessing.
        onboarding_complete: Optional onboarding flag. When provided, sets the
            ``equipment_kb.onboarding_complete`` column AND mirrors it inside
            ``structured_data.kb_meta.onboarding_complete`` so reads from either
            location stay consistent.

    Returns:
        The same shape as ``get_equipment_kb`` after the write.

    Raises:
        NotFoundError: When no ``equipment_kb`` row exists for the cell.
        ValidationFailedError: When the merged thresholds drop a key referenced
            by ``process_signal_definition.kb_threshold_key`` (#69).
    """
    if "calibration_log" in structured_data_patch:
        # Hard-stop: clients must not push to calibration_log directly,
        # otherwise the audit trail is forgeable.
        raise ValueError(
            "calibration_log is server-managed (append-only); remove it from the patch"
        )

    async with with_conn() as conn:
        repo = KbRepository(conn)
        row = await repo.get_by_cell(cell_id)
        if row is None:
            raise NotFoundError(f"no equipment_kb row for cell {cell_id}")

        existing = _decode_structured_data(row["structured_data"])
        merged = merge_structured_data(existing, structured_data_patch)

        # Apply auto-housekeeping (audit §3) on top of the merge.
        kb_meta = dict(merged.get("kb_meta") or {})
        kb_meta["version"] = int(kb_meta.get("version", 1)) + 1
        kb_meta["last_calibrated_by"] = calibrated_by

        # Append calibration_log (audit §2) — exempt from merge.
        log_entries = list(existing.get("calibration_log") or [])
        log_entries.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source": source,
                "calibrated_by": calibrated_by,
                "patch_summary": _patch_summary(structured_data_patch),
            }
        )
        merged["calibration_log"] = log_entries

        # Recompute completeness via the canonical Pydantic helper.
        kb_model = EquipmentKB.model_validate(merged)
        completeness = kb_model.compute_completeness()
        kb_meta["completeness_score"] = completeness
        if onboarding_complete is not None:
            kb_meta["onboarding_complete"] = onboarding_complete
        merged["kb_meta"] = kb_meta

        now = datetime.now(timezone.utc)
        upsert_fields: dict[str, Any] = {
            "cell_id": cell_id,
            "structured_data": merged,
            "confidence_score": completeness,
            "last_enriched_at": now,
            "last_updated_by": calibrated_by,
        }
        if raw_markdown is not None:
            upsert_fields["raw_markdown"] = raw_markdown
        if onboarding_complete is not None:
            upsert_fields["onboarding_complete"] = onboarding_complete
        await repo.upsert(upsert_fields)
        fresh = await repo.get_by_cell(cell_id)

    # TODO(M8.2 — issue #46): audit M2.5 §4 broadcast.
    # When ws_manager lands, insert here:
    #     await ws_manager.broadcast(
    #         "kb_updated", {"cell_id": cell_id, "version": kb_meta["version"]}
    #     )
    # Without this, two browser tabs editing the same cell silently overwrite
    # each other (lost-update bug). See sequence diagrams on issue #46.

    assert fresh is not None  # just upserted
    structured = _decode_structured_data(fresh["structured_data"])
    return {
        "cell_id": fresh["cell_id"],
        "cell_name": fresh["cell_name"],
        "equipment_type": fresh["equipment_type"],
        "manufacturer": fresh["manufacturer"],
        "model": fresh["model"],
        "installation_date": (
            fresh["installation_date"].isoformat() if fresh["installation_date"] else None
        ),
        "structured_data": structured,
        "confidence_score": float(fresh["confidence_score"] or 0.0),
        "last_enriched_at": (
            fresh["last_enriched_at"].isoformat() if fresh["last_enriched_at"] else None
        ),
        "onboarding_complete": bool(fresh["onboarding_complete"]),
        "last_updated_by": fresh["last_updated_by"],
        "last_updated_at": fresh["last_updated_at"].isoformat(),
    }
