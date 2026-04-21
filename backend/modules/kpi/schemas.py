"""KPI DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class OeeDTO(BaseModel):
    availability: Optional[float] = None
    performance: Optional[float] = None
    quality: Optional[float] = None
    oee: Optional[float] = None


class OeeBucketDTO(BaseModel):
    bucket: datetime
    cell_id: int
    availability: Optional[float] = None
    performance: Optional[float] = None
    quality: Optional[float] = None
    oee: Optional[float] = None


class MaintenanceKpiDTO(BaseModel):
    mttr_seconds: Optional[float] = None
    mtbf_seconds: Optional[float] = None


class ProductionStatsDTO(BaseModel):
    productive_seconds: float = 0
    unplanned_stop_seconds: float = 0
    planned_stop_seconds: float = 0
    total_pieces: int = 0
    good_pieces: int = 0


class QualityByCellDTO(BaseModel):
    cell_id: int
    cell_name: str
    line_name: str
    total_pieces: int
    good_pieces: int
    bad_pieces: int
    quality_rate: Optional[float] = Field(None, description="good / total in [0, 1]")
