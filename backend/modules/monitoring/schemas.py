"""Monitoring DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CurrentCellStatusDTO(BaseModel):
    cell_id: int
    cell_name: str
    line_id: int
    line_name: str
    area_id: int
    area_name: str
    site_id: int
    site_name: str
    enterprise_id: int
    enterprise_name: str
    last_status_change: Optional[datetime] = None
    status_name: Optional[str] = None
    status_category: Optional[str] = None
    is_productive: Optional[bool] = None


class MachineStatusEventDTO(BaseModel):
    time: datetime
    cell_id: int
    cell_name: str
    line_name: str
    status_code: int
    status_name: str
    status_category: str
    plc_status_raw: Optional[int] = None
    plc_label: Optional[str] = None
    end_time: Optional[datetime] = None
    duration_seconds: Optional[float] = None


class ProductionEventDTO(BaseModel):
    time: datetime
    cell_id: int
    cell_name: str
    line_name: str
    piece_counter: int
    quality_code: int
    quality_name: str
    is_conformant: bool
    plc_quality_raw: Optional[int] = None
    plc_label: Optional[str] = None
    status_code: int
    status_name: str
