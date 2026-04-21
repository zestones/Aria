"""Logbook DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


Category = Literal["observation", "maintenance", "incident", "changeover", "note"]
Severity = Literal["info", "warning", "critical"]


class LogbookEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    cell_id: int
    cell_name: Optional[str] = None
    author_id: Optional[int] = None
    author_username: Optional[str] = None
    entry_time: datetime
    category: str
    severity: str
    content: str
    related_signal_def_id: Optional[int] = None
    created_at: datetime


class LogbookEntryCreate(BaseModel):
    cell_id: int
    category: Category = "note"
    severity: Severity = "info"
    content: str = Field(..., min_length=1)
    related_signal_def_id: Optional[int] = None
    entry_time: Optional[datetime] = None
