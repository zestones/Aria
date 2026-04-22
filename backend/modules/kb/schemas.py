"""Knowledge base + failure history DTOs."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class EquipmentKbOut(_Base):
    id: int
    cell_id: int
    cell_name: Optional[str] = None
    equipment_type: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    installation_date: Optional[date] = None
    nominal_specs: Optional[Any] = None
    common_failure_modes: Optional[Any] = None
    maintenance_recommendations: Optional[Any] = None
    notes: Optional[str] = None
    last_updated_by: Optional[str] = None
    last_updated_at: datetime
    created_at: datetime


class EquipmentKbUpsert(BaseModel):
    cell_id: int
    equipment_type: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    installation_date: Optional[date] = None
    nominal_specs: Optional[Any] = None
    common_failure_modes: Optional[Any] = None
    maintenance_recommendations: Optional[Any] = None
    notes: Optional[str] = None
    last_updated_by: Optional[str] = "kb_builder_agent"


class FailureHistoryOut(_Base):
    id: int
    cell_id: int
    cell_name: Optional[str] = None
    failure_time: datetime
    resolved_time: Optional[datetime] = None
    failure_mode: str
    root_cause: Optional[str] = None
    resolution: Optional[str] = None
    parts_replaced: Optional[Any] = None
    downtime_minutes: Optional[int] = None
    cost_estimate: Optional[Decimal] = None
    work_order_id: Optional[int] = None
    signal_patterns: Optional[Any] = None
    created_at: datetime
