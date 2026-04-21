"""User CRUD (admin-only) + change-password."""

from __future__ import annotations

import asyncpg
from core.api_response import created, deleted, ok
from core.database import get_db
from core.security import CurrentUser, Role, get_current_user, require_role
from core.serialization import serialize
from fastapi import APIRouter, Depends
from modules.auth.schemas import (
    ChangePasswordRequest,
    CreateUserRequest,
    UpdateUserRequest,
    UserOut,
)
from modules.auth.service import UserService

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def _to_user_dto(record: asyncpg.Record) -> dict:
    return serialize(UserOut, record)


@router.get("")
async def list_users(
    _admin: CurrentUser = Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await UserService(conn).list_all(include_inactive=True)
    return ok([_to_user_dto(r) for r in rows])


@router.get("/{user_id}")
async def get_user(
    user_id: int,
    _admin: CurrentUser = Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    return ok(_to_user_dto(await UserService(conn).get(user_id)))


@router.post("")
async def create_user(
    body: CreateUserRequest,
    _admin: CurrentUser = Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    record = await UserService(conn).create(
        username=body.username,
        password=body.password,
        email=body.email,
        full_name=body.full_name,
        role=body.role.value,
        is_active=body.is_active,
    )
    return created(_to_user_dto(record))


@router.put("/{user_id}")
async def update_user(
    user_id: int,
    body: UpdateUserRequest,
    _admin: CurrentUser = Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    record = await UserService(conn).update(user_id, body.model_dump(exclude_unset=True))
    return ok(_to_user_dto(record))


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    _admin: CurrentUser = Depends(require_role(Role.ADMIN)),
    conn: asyncpg.Connection = Depends(get_db),
):
    await UserService(conn).deactivate(user_id)
    return deleted(f"User {user_id} deactivated")


@router.post("/me/change-password")
async def change_own_password(
    body: ChangePasswordRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    await UserService(conn).change_password(user.user_id, body.current_password, body.new_password)
    return ok({"message": "Password changed successfully"})
