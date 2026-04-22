"""Contract tests for EquipmentKB domain model (backend/modules/kb/kb_schema.py).

Unit tests run with no external dependencies and lock the JSON shape agreed in
migration 007 (P-02 Grundfos CR 32-2 seed blob).

Integration test (marked `integration`, skipped by `make test`) validates the
real DB row once the stack is up.
"""

from __future__ import annotations

import json

import pytest
from modules.kb.kb_schema import (
    EquipmentKB,
    EquipmentMeta,
    FailurePattern,
    KbMeta,
    MaintenanceProcedure,
    ThresholdValue,
)

# ---------------------------------------------------------------------------
# Canonical P-02 fixture — mirrors the jsonb_build_object blob in
# 007_aria_kb_workorder_extension.up.sql.  Any shape change to the migration
# seed MUST be reflected here and vice-versa.
# ---------------------------------------------------------------------------
P02_STRUCTURED_DATA: dict = {
    "equipment": {
        "cell_id": 1,
        "equipment_type": "Centrifugal Pump",
        "manufacturer": "Grundfos",
        "model": "CR 32-2",
        "installation_date": "2024-10-22",
        "service_description": "Main raw water booster, 24/7 service",
        "motor_power_kw": 5.5,
        "rpm_nominal": 2900,
    },
    "thresholds": {
        # single-sided (alert + trip)
        "vibration_mm_s": {
            "nominal": 2.2,
            "alert": 4.5,
            "trip": 7.1,
            "unit": "mm/s",
            "source": "ISO 10816-3 Zone B/C boundary",
            "confidence": 0.9,
        },
        "bearing_temp_c": {
            "nominal": 48,
            "alert": 75,
            "trip": 90,
            "unit": "°C",
            "source": "Grundfos CR service manual",
            "confidence": 0.85,
        },
        # double-sided (low_alert + high_alert)
        "flow_l_min": {
            "nominal": 533,
            "low_alert": 480,
            "high_alert": 580,
            "unit": "L/min",
            "source": "Process design duty point (32 m³/h)",
            "confidence": 0.9,
        },
        "pressure_bar": {
            "nominal": 5.5,
            "low_alert": 4.5,
            "high_alert": 6.5,
            "unit": "bar",
            "source": "Process design",
            "confidence": 0.9,
        },
    },
    "failure_patterns": [
        {
            "mode": "bearing_wear",
            "symptoms": "progressive vibration drift, bearing temp rise",
            "mtbf_months": 14,
            "signal_signature": {
                "vibration_mm_s": "slow_drift_up",
                "bearing_temp_c": "slow_drift_up",
            },
        },
        {
            "mode": "mechanical_seal_leak",
            "symptoms": "flow drop, pressure fluctuation",
            "mtbf_months": 24,
            "signal_signature": {
                "flow_l_min": "step_drop",
                "pressure_bar": "oscillation",
            },
        },
        {
            "mode": "impeller_imbalance",
            "symptoms": "sudden vibration spike at 1x rpm",
            "mtbf_months": 36,
            "signal_signature": {"vibration_mm_s": "step_up"},
        },
    ],
    "maintenance_procedures": [
        {
            "action": "bearing replacement",
            "interval_months": 12,
            "duration_min": 240,
            "parts": [
                "Grundfos 96416067 upper bearing",
                "Grundfos 96416068 lower bearing",
            ],
        },
        {
            "action": "shaft seal replacement",
            "interval_months": 18,
            "duration_min": 180,
            "parts": ["Grundfos 96416072 shaft seal kit (HQQE)"],
        },
        {
            "action": "vibration spectrum analysis",
            "interval_months": 3,
            "duration_min": 30,
            "parts": [],
        },
    ],
    "kb_meta": {
        "version": 1,
        "completeness_score": 0.85,
        "onboarding_complete": True,
        "last_calibrated_by": "seed",
    },
}


# ---------------------------------------------------------------------------
# Unit tests — no database required
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_equipment_kb_empty_construction():
    """EquipmentKB can be built with all-empty sub-models (partial KB)."""
    kb = EquipmentKB()
    dump = kb.model_dump()
    assert set(dump.keys()) == {
        "equipment",
        "thresholds",
        "failure_patterns",
        "maintenance_procedures",
        "kb_meta",
    }
    assert kb.compute_completeness() == 0.0


@pytest.mark.unit
def test_p02_seed_validates():
    """EquipmentKB.model_validate accepts the canonical P-02 seed shape."""
    kb = EquipmentKB.model_validate(P02_STRUCTURED_DATA)

    assert isinstance(kb.equipment, EquipmentMeta)
    assert kb.equipment.manufacturer == "Grundfos"
    assert kb.equipment.model == "CR 32-2"

    assert "vibration_mm_s" in kb.thresholds
    assert isinstance(kb.thresholds["vibration_mm_s"], ThresholdValue)

    assert len(kb.failure_patterns) == 3
    assert all(isinstance(fp, FailurePattern) for fp in kb.failure_patterns)

    assert len(kb.maintenance_procedures) == 3
    assert all(isinstance(mp, MaintenanceProcedure) for mp in kb.maintenance_procedures)

    assert isinstance(kb.kb_meta, KbMeta)
    assert kb.kb_meta.onboarding_complete is True


@pytest.mark.unit
def test_p02_seed_validates_from_json_string():
    """model_validate works on a JSON-decoded dict (mirrors json.loads path)."""
    # Simulate what decode_record() returns after asyncpg jsonb parse
    raw = json.dumps(P02_STRUCTURED_DATA)
    kb = EquipmentKB.model_validate(json.loads(raw))
    assert kb.equipment.manufacturer == "Grundfos"


@pytest.mark.unit
def test_threshold_single_sided():
    """alert-based threshold is recognised as filled."""
    t = ThresholdValue(alert=4.5)
    assert t.is_filled is True


@pytest.mark.unit
def test_threshold_double_sided():
    """low_alert / high_alert threshold is recognised as filled."""
    t = ThresholdValue(low_alert=480, high_alert=580)
    assert t.is_filled is True


@pytest.mark.unit
def test_threshold_empty_not_filled():
    """Threshold with only nominal (no alert bounds) is not filled."""
    t = ThresholdValue(nominal=5.5)
    assert t.is_filled is False


@pytest.mark.unit
def test_compute_completeness_p02_is_high():
    """P-02 full seed completeness should be >= 0.85."""
    kb = EquipmentKB.model_validate(P02_STRUCTURED_DATA)
    score = kb.compute_completeness()
    assert score >= 0.85, f"Expected >= 0.85, got {score}"


@pytest.mark.unit
def test_compute_completeness_partial_kb():
    """Partial KB with only 1 threshold and no failure patterns scores < 0.5."""
    kb = EquipmentKB.model_validate(
        {
            "equipment": {"manufacturer": "Grundfos"},
            "thresholds": {"vibration_mm_s": {"alert": 4.5}},
        }
    )
    score = kb.compute_completeness()
    # 1 threshold out of 3 expected -> 0.5 * (1/3) = ~0.167
    # 1 equipment field out of 8 -> 0.1 * (1/8) = ~0.012
    assert score < 0.25


# ---------------------------------------------------------------------------
# Integration test — requires a running TimescaleDB with migrations applied
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_p02_db_row_validates_as_equipment_kb(db_conn):
    """Live DB: structured_data for P-02 must validate as EquipmentKB."""
    row = await db_conn.fetchrow(
        "SELECT k.structured_data FROM equipment_kb k "
        "JOIN cell c ON k.cell_id = c.id WHERE c.name = 'P-02'"
    )
    assert row is not None, "P-02 row not found — run migrations first"
    kb = EquipmentKB.model_validate(json.loads(row["structured_data"]))
    assert kb.equipment.manufacturer == "Grundfos"
    assert kb.compute_completeness() >= 0.85
