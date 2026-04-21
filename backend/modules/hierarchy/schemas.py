"""ISA-95 hierarchy DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class EnterpriseOut(_Base):
    id: int
    name: str
    disable: bool
    created_at: datetime
    updated_at: Optional[datetime] = None


class SiteOut(_Base):
    id: int
    name: str
    disable: bool
    parentid: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class AreaOut(_Base):
    id: int
    name: str
    disable: bool
    parentid: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class LineOut(_Base):
    id: int
    name: str
    disable: bool
    parentid: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class CellOut(_Base):
    id: int
    name: str
    disable: bool
    parentid: int
    ideal_cycle_time_seconds: Optional[float] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


# Write models
class EnterpriseCreate(BaseModel):
    name: str = Field(..., max_length=45)


class EnterpriseUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=45)
    disable: Optional[bool] = None


class SiteCreate(BaseModel):
    name: str = Field(..., max_length=45)
    parentid: int


class SiteUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=45)
    parentid: Optional[int] = None
    disable: Optional[bool] = None


class AreaCreate(BaseModel):
    name: str = Field(..., max_length=45)
    parentid: int


class AreaUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=45)
    parentid: Optional[int] = None
    disable: Optional[bool] = None


class LineCreate(BaseModel):
    name: str = Field(..., max_length=45)
    parentid: int


class LineUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=45)
    parentid: Optional[int] = None
    disable: Optional[bool] = None


class CellCreate(BaseModel):
    name: str = Field(..., max_length=45)
    parentid: int
    ideal_cycle_time_seconds: Optional[float] = None


class CellUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=45)
    parentid: Optional[int] = None
    ideal_cycle_time_seconds: Optional[float] = None
    disable: Optional[bool] = None
