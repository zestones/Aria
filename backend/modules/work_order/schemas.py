"""Work order DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Priority = Literal["low", "medium", "high", "critical"]
Status = Literal["detected", "analyzed", "open", "in_progress", "completed", "cancelled"]


class WorkOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    cell_id: int
    cell_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    priority: str
    status: str
    estimated_duration_min: Optional[int] = None
    required_parts: Optional[Any] = None
    required_skills: Optional[Any] = None
    suggested_window_start: Optional[datetime] = None
    suggested_window_end: Optional[datetime] = None
    created_by: Optional[str] = None
    assigned_to: Optional[int] = None
    assigned_to_username: Optional[str] = None
    triggered_by_signal_def_id: Optional[int] = None
    triggered_by_alert: Optional[str] = None
    rca_summary: Optional[str] = None
    recommended_actions: Optional[Any] = None
    generated_by_agent: bool = False
    trigger_anomaly_time: Optional[datetime] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class WorkOrderCreate(BaseModel):
    cell_id: int
    title: str = Field(..., max_length=200)
    description: Optional[str] = None
    priority: Priority = "medium"
    status: Status = "open"
    estimated_duration_min: Optional[int] = None
    required_parts: Optional[Any] = None
    required_skills: Optional[Any] = None
    suggested_window_start: Optional[datetime] = None
    suggested_window_end: Optional[datetime] = None
    created_by: Optional[str] = None
    assigned_to: Optional[int] = None
    triggered_by_signal_def_id: Optional[int] = None
    triggered_by_alert: Optional[str] = None
    rca_summary: Optional[str] = None
    recommended_actions: Optional[Any] = None
    generated_by_agent: bool = False
    trigger_anomaly_time: Optional[datetime] = None


class WorkOrderUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    priority: Optional[Priority] = None
    status: Optional[Status] = None
    estimated_duration_min: Optional[int] = None
    required_parts: Optional[Any] = None
    required_skills: Optional[Any] = None
    suggested_window_start: Optional[datetime] = None
    suggested_window_end: Optional[datetime] = None
    assigned_to: Optional[int] = None
    completed_at: Optional[datetime] = None
    rca_summary: Optional[str] = None
    recommended_actions: Optional[Any] = None
    trigger_anomaly_time: Optional[datetime] = None
