"""Signal DTOs (process_signal_definition, signal_tag, signal data points)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SignalTagOut(_Base):
    id: int
    cell_id: int
    tag_address: str
    tag_name: str
    description: Optional[str] = None
    is_active: bool
    is_core: bool
    created_at: datetime
    updated_at: Optional[datetime] = None


class SignalTagCreate(BaseModel):
    cell_id: int
    tag_address: str = Field(..., max_length=255)
    tag_name: str = Field(..., max_length=100)
    description: Optional[str] = None
    is_active: bool = True
    is_core: bool = False


class SignalTagUpdate(BaseModel):
    tag_address: Optional[str] = Field(None, max_length=255)
    tag_name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_core: Optional[bool] = None


class SignalDefinitionOut(_Base):
    id: int
    cell_id: int
    signal_tag_id: int
    display_name: str
    unit_id: Optional[int] = None
    signal_type_id: Optional[int] = None
    unit_name: Optional[str] = None
    signal_type_name: Optional[str] = None
    tag_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class SignalDefinitionCreate(BaseModel):
    cell_id: int
    signal_tag_id: int
    display_name: str
    unit_id: Optional[int] = None
    signal_type_id: Optional[int] = None


class SignalDefinitionUpdate(BaseModel):
    display_name: Optional[str] = None
    unit_id: Optional[int] = None
    signal_type_id: Optional[int] = None


class SignalDataPointDTO(BaseModel):
    time: datetime
    raw_value: float


class CurrentSignalValueDTO(BaseModel):
    signal_def_id: int
    cell_id: int
    cell_name: str
    line_name: str
    display_name: str
    unit: Optional[str] = None
    signal_type: Optional[str] = None
    last_update: Optional[datetime] = None
    raw_value: Optional[float] = None


class SignalTypeOut(_Base):
    id: int
    type_name: str
    description: Optional[str] = None


class UnitOut(_Base):
    id: int
    unit_name: str
    description: Optional[str] = None
