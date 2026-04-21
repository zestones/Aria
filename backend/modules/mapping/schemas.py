"""Mapping DTOs (status/quality reference codes + cell PLC mappings)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MachineStatusCodeOut(_Base):
    status_code: int
    status_name: str
    is_productive: bool
    status_category: str


class QualityCodeOut(_Base):
    quality_code: int
    quality_name: str
    is_conformant: bool


class PlcLabelOut(_Base):
    id: int
    label_name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class CellStatusMappingOut(_Base):
    id: int
    cell_id: int
    plc_raw_value: int
    status_code: int
    plc_status_label_id: Optional[int] = None
    description: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class CellStatusMappingCreate(BaseModel):
    cell_id: int
    plc_raw_value: int
    status_code: int
    plc_status_label_id: Optional[int] = None
    description: Optional[str] = None


class CellStatusMappingUpdate(BaseModel):
    plc_raw_value: Optional[int] = None
    status_code: Optional[int] = None
    plc_status_label_id: Optional[int] = None
    description: Optional[str] = None


class CellQualityMappingOut(_Base):
    id: int
    cell_id: int
    plc_raw_value: int
    quality_code: int
    plc_quality_label_id: Optional[int] = None
    description: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class CellQualityMappingCreate(BaseModel):
    cell_id: int
    plc_raw_value: int
    quality_code: int
    plc_quality_label_id: Optional[int] = None
    description: Optional[str] = None


class CellQualityMappingUpdate(BaseModel):
    plc_raw_value: Optional[int] = None
    quality_code: Optional[int] = None
    plc_quality_label_id: Optional[int] = None
    description: Optional[str] = None


class PlcLabelCreate(BaseModel):
    label_name: str = Field(..., max_length=100)
    description: Optional[str] = None
