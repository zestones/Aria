"""Shift DTOs."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ShiftOut(_Base):
    id: int
    name: str
    start_time: time
    end_time: time
    created_at: datetime


class ShiftAssignmentOut(_Base):
    id: int
    shift_id: int
    shift_name: Optional[str] = None
    user_id: int
    username: Optional[str] = None
    full_name: Optional[str] = None
    cell_id: Optional[int] = None
    cell_name: Optional[str] = None
    assigned_date: date
    created_at: datetime


class CurrentShiftDTO(BaseModel):
    shift: Optional[ShiftOut] = None
    assignments: list[ShiftAssignmentOut] = []
    server_time: datetime


class ShiftAssignmentCreate(BaseModel):
    shift_id: int
    user_id: int
    cell_id: Optional[int] = None
    assigned_date: date
