"""Domain model for equipment_kb.structured_data (jsonb blob).

This is NOT an API DTO — it is the structured schema that agents read/write.
The outer equipment_kb row uses EquipmentKbOut (schemas.py) for the API layer;
structured_data is decoded from jsonb and validated against EquipmentKB here.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ThresholdValue(BaseModel):
    """Per-signal threshold configuration.

    Supports two alert patterns:
    - single-sided:  ``alert`` (e.g. vibration, temperature)
    - double-sided:  ``low_alert`` / ``high_alert`` (e.g. flow, pressure)
    """

    model_config = ConfigDict(extra="allow")

    nominal: Optional[float] = None
    # single-sided threshold
    alert: Optional[float] = None
    trip: Optional[float] = None
    # double-sided threshold
    low_alert: Optional[float] = None
    high_alert: Optional[float] = None
    unit: Optional[str] = None
    source: Optional[str] = None
    confidence: Optional[float] = None

    @property
    def is_filled(self) -> bool:
        """True when at least one alert bound is defined."""
        return self.alert is not None or self.low_alert is not None or self.high_alert is not None


class FailurePattern(BaseModel):
    model_config = ConfigDict(extra="allow")

    mode: str
    symptoms: Optional[str] = None
    mtbf_months: Optional[int] = None
    signal_signature: Optional[dict[str, Any]] = None


class MaintenanceProcedure(BaseModel):
    model_config = ConfigDict(extra="allow")

    action: str
    interval_months: Optional[int] = None
    duration_min: Optional[int] = None
    parts: list[str] = Field(default_factory=list)


class EquipmentMeta(BaseModel):
    """Identifying metadata for the equipment."""

    model_config = ConfigDict(extra="allow")

    cell_id: Optional[int] = None
    equipment_type: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    installation_date: Optional[date] = None
    service_description: Optional[str] = None
    motor_power_kw: Optional[float] = None
    rpm_nominal: Optional[int] = None


class KbMeta(BaseModel):
    model_config = ConfigDict(extra="allow")

    version: int = 1
    completeness_score: float = 0.0
    onboarding_complete: bool = False
    last_calibrated_by: Optional[str] = None


# Fields used to score the equipment section of completeness.
_EQUIPMENT_SCORED_FIELDS = (
    "cell_id",
    "equipment_type",
    "manufacturer",
    "model",
    "installation_date",
    "service_description",
    "motor_power_kw",
    "rpm_nominal",
)

# Expected minimum counts per section for a "complete" KB.
_EXPECTED_THRESHOLDS = 3
_EXPECTED_FAILURE_PATTERNS = 3
_EXPECTED_PROCEDURES = 3


class EquipmentKB(BaseModel):
    """Top-level KB blob stored in ``equipment_kb.structured_data``.

    All sections default to empty so a partial KB (e.g. after a PDF-only
    import before operator calibration) is still valid.
    """

    model_config = ConfigDict(extra="allow")

    equipment: EquipmentMeta = Field(default_factory=EquipmentMeta)
    thresholds: dict[str, ThresholdValue] = Field(default_factory=dict)
    failure_patterns: list[FailurePattern] = Field(default_factory=list)
    maintenance_procedures: list[MaintenanceProcedure] = Field(default_factory=list)
    kb_meta: KbMeta = Field(default_factory=KbMeta)

    def compute_completeness(self) -> float:
        """Return a weighted completeness score in [0.0, 1.0].

        Weights:
        - thresholds            50 %  (Sentinel uses them directly)
        - failure_patterns      20 %  (Investigator pattern matching)
        - maintenance_procedures 20 % (Work Order Generator)
        - equipment              10 % (identifying metadata)
        """
        weights = {
            "thresholds": 0.50,
            "failure_patterns": 0.20,
            "maintenance_procedures": 0.20,
            "equipment": 0.10,
        }

        # Equipment: fraction of key metadata fields that are non-None.
        filled_eq = sum(
            1 for f in _EQUIPMENT_SCORED_FIELDS if getattr(self.equipment, f, None) is not None
        )
        eq_score = filled_eq / len(_EQUIPMENT_SCORED_FIELDS)

        # Thresholds: count thresholds that have at least one alert bound.
        filled_thr = sum(1 for t in self.thresholds.values() if t.is_filled)
        thr_score = min(filled_thr, _EXPECTED_THRESHOLDS) / _EXPECTED_THRESHOLDS

        # Failure patterns: existence of known failure modes.
        fp_score = (
            min(len(self.failure_patterns), _EXPECTED_FAILURE_PATTERNS) / _EXPECTED_FAILURE_PATTERNS
        )

        # Maintenance procedures: existence of scheduled maintenance.
        mp_score = (
            min(len(self.maintenance_procedures), _EXPECTED_PROCEDURES) / _EXPECTED_PROCEDURES
        )

        return round(
            weights["equipment"] * eq_score
            + weights["thresholds"] * thr_score
            + weights["failure_patterns"] * fp_score
            + weights["maintenance_procedures"] * mp_score,
            4,
        )
