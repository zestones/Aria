"""Unit tests for WorkOrder schemas (M1.6).

Covers:
- Status literal widening (detected, analyzed)
- 4 new fields on WorkOrderOut / WorkOrderCreate / WorkOrderUpdate
- recommended_actions JSON roundtrip via encode_fields / decode_record
- Status transition sequence acceptance
"""

from __future__ import annotations

import pytest
from modules.work_order.schemas import WorkOrderCreate, WorkOrderOut, WorkOrderUpdate

# ---------------------------------------------------------------------------
# Status literal tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_status_detected_accepted():
    """WorkOrderCreate accepts status='detected' (Sentinel-created WOs)."""
    wo = WorkOrderCreate(cell_id=1, title="Anomaly detected", status="detected")
    assert wo.status == "detected"


@pytest.mark.unit
def test_status_analyzed_accepted():
    """WorkOrderCreate accepts status='analyzed'."""
    wo = WorkOrderCreate(cell_id=1, title="RCA done", status="analyzed")
    assert wo.status == "analyzed"


@pytest.mark.unit
def test_status_update_all_values():
    """WorkOrderUpdate accepts all 6 status values."""
    for status in ("detected", "analyzed", "open", "in_progress", "completed", "cancelled"):
        u = WorkOrderUpdate(status=status)  # type: ignore[arg-type]
        assert u.status == status


# ---------------------------------------------------------------------------
# New fields on WorkOrderCreate / WorkOrderOut
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_work_order_create_new_fields():
    """WorkOrderCreate accepts all 4 new agent fields."""
    from datetime import datetime, timezone

    ts = datetime(2026, 4, 22, 10, 0, 0, tzinfo=timezone.utc)
    wo = WorkOrderCreate(
        cell_id=2,
        title="Bearing failure detected",
        status="detected",
        rca_summary="Bearing vibration drift exceeds threshold",
        recommended_actions=[{"action": "replace_bearing", "priority": "high"}],
        generated_by_agent=True,
        trigger_anomaly_time=ts,
    )
    assert wo.rca_summary == "Bearing vibration drift exceeds threshold"
    assert wo.generated_by_agent is True
    assert wo.trigger_anomaly_time == ts


@pytest.mark.unit
def test_work_order_update_new_fields():
    """WorkOrderUpdate accepts rca_summary, recommended_actions, trigger_anomaly_time."""
    from datetime import datetime, timezone

    ts = datetime(2026, 4, 22, 11, 0, 0, tzinfo=timezone.utc)
    u = WorkOrderUpdate.model_validate(
        {
            "status": "analyzed",
            "rca_summary": "Seal wear identified",
            "recommended_actions": {"steps": ["inspect", "replace"]},
            "trigger_anomaly_time": ts,
        }
    )
    assert u.rca_summary == "Seal wear identified"
    assert u.trigger_anomaly_time == ts


# ---------------------------------------------------------------------------
# Roundtrip: WorkOrderCreate -> encode_fields -> decode_record -> WorkOrderOut
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_recommended_actions_roundtrip():
    """recommended_actions dict survives encode_fields -> decode_record cycle."""
    from core.json_fields import decode_record, encode_fields
    from modules.work_order.repository import JSON_FIELDS

    create_body = WorkOrderCreate(
        cell_id=1,
        title="WO roundtrip",
        status="detected",
        generated_by_agent=True,
        recommended_actions=[{"action": "lubricate_bearing", "interval_h": 500}],
    )
    fields = create_body.model_dump(mode="json", exclude_unset=True)

    # encode for DB
    encoded = encode_fields(fields, JSON_FIELDS)
    assert isinstance(encoded["recommended_actions"], str), "encode_fields must stringify jsonb"

    # simulate DB row returned by asyncpg
    from datetime import datetime, timezone

    now_str = datetime(2026, 4, 22, tzinfo=timezone.utc).isoformat()
    fake_row = {
        **encoded,
        "id": 42,
        "cell_name": "Bottle Filler",
        "required_parts": None,
        "required_skills": None,
        "description": None,
        "priority": "medium",
        "estimated_duration_min": None,
        "suggested_window_start": None,
        "suggested_window_end": None,
        "created_by": None,
        "assigned_to": None,
        "assigned_to_username": None,
        "triggered_by_signal_def_id": None,
        "triggered_by_alert": None,
        "rca_summary": None,
        "trigger_anomaly_time": None,
        "created_at": now_str,
        "completed_at": None,
    }

    decoded = decode_record(fake_row, JSON_FIELDS)
    assert isinstance(decoded["recommended_actions"], list), "decode_record must parse back to list"

    out = WorkOrderOut.model_validate(decoded)
    assert out.recommended_actions == [{"action": "lubricate_bearing", "interval_h": 500}]
    assert out.generated_by_agent is True
    assert out.status == "detected"
    assert out.status == "detected"
