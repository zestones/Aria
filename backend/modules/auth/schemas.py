"""Auth + user DTOs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from core.security.role import Role


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: str | None = None
    full_name: str | None = None
    role: str
    is_active: bool
    created_at: datetime
    last_login: datetime | None = None


class LoginResponse(BaseModel):
    user: UserOut


class RefreshResponse(BaseModel):
    message: str = "Token refreshed successfully"


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    email: str | None = Field(None, max_length=255)
    full_name: str | None = Field(None, max_length=100)
    role: Role = Role.VIEWER
    is_active: bool = True


class UpdateUserRequest(BaseModel):
    email: str | None = None
    full_name: str | None = None
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(None, min_length=6)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)
