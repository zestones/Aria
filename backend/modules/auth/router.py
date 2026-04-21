"""Auth endpoints: login, refresh, logout, me."""

from __future__ import annotations

import asyncpg
from fastapi import APIRouter, Depends, Request, Response

from core.api_response import ok
from core.database import get_db
from core.exceptions import AuthenticationError
from core.security import CurrentUser, get_current_user
from core.security.cookies import (
    clear_auth_cookies,
    get_refresh_token,
    is_secure_request,
    set_auth_cookies,
)
from core.serialization import serialize
from modules.auth.schemas import LoginRequest, LoginResponse, RefreshResponse, UserOut
from modules.auth.service import AuthService

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login")
async def login(
    body: LoginRequest, request: Request, conn: asyncpg.Connection = Depends(get_db)
) -> Response:
    user, access, refresh = await AuthService(conn).login(body.username, body.password)
    response = ok(LoginResponse(user=UserOut.model_validate(dict(user))).model_dump(mode="json"))
    set_auth_cookies(response, access, refresh, secure=is_secure_request(request))
    return response


@router.post("/refresh")
async def refresh(request: Request, conn: asyncpg.Connection = Depends(get_db)) -> Response:
    token = get_refresh_token(request)
    if not token:
        raise AuthenticationError("Refresh token required")
    _user, access, new_refresh = await AuthService(conn).refresh(token)
    response = ok(RefreshResponse().model_dump())
    set_auth_cookies(response, access, new_refresh, secure=is_secure_request(request))
    return response


@router.post("/logout")
async def logout(
    user: CurrentUser = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db),
) -> Response:
    await AuthService(conn).logout(user.user_id)
    response = ok({"message": "Logged out successfully"})
    clear_auth_cookies(response)
    return response


@router.get("/me")
async def me(
    user: CurrentUser = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db),
) -> Response:
    from modules.auth.service import UserService

    record = await UserService(conn).get(user.user_id)
    return ok(serialize(UserOut, record))
