"""Auth + user services."""

from __future__ import annotations

from typing import Any

import asyncpg

from core.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    NotFoundError,
)
from core.security.jwt import (
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
)
from core.security.password import hash_password, verify_password
from modules.auth.repository import UserRepository


class AuthService:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.repo = UserRepository(conn)

    async def login(self, username: str, password: str) -> tuple[asyncpg.Record, str, str]:
        user = await self.repo.get_by_username(username)
        if not user or not verify_password(password, user["password_hash"]):
            raise AuthenticationError("Invalid username or password")
        if not user["is_active"]:
            raise AuthorizationError("Account is disabled")

        access, _ = create_access_token(user["id"], user["username"], user["role"])
        refresh, _ = create_refresh_token(user["id"], user["token_version"])
        await self.repo.update_last_login(user["id"])
        return user, access, refresh

    async def refresh(self, token: str) -> tuple[asyncpg.Record, str, str]:
        payload = verify_refresh_token(token)
        if not payload:
            raise AuthenticationError("Invalid or expired refresh token")
        user = await self.repo.get_by_id(int(payload["sub"]))
        if not user or not user["is_active"]:
            raise AuthenticationError("User not found or account disabled")
        if payload.get("tv") != user["token_version"]:
            raise AuthenticationError("Token has been revoked")

        access, _ = create_access_token(user["id"], user["username"], user["role"])
        new_refresh, _ = create_refresh_token(user["id"], user["token_version"])
        return user, access, new_refresh

    async def logout(self, user_id: int) -> None:
        await self.repo.increment_token_version(user_id)


class UserService:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.repo = UserRepository(conn)

    async def list_all(self, *, include_inactive: bool = True) -> list[asyncpg.Record]:
        return await self.repo.list_all(include_inactive=include_inactive)

    async def get(self, user_id: int) -> asyncpg.Record:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")
        return user

    async def create(
        self,
        *,
        username: str,
        password: str,
        email: str | None,
        full_name: str | None,
        role: str,
        is_active: bool,
    ) -> asyncpg.Record:
        if await self.repo.get_by_username(username):
            raise ConflictError(f"Username '{username}' already exists")
        if email and await self.repo.get_by_email(email):
            raise ConflictError(f"Email '{email}' already exists")
        return await self.repo.create(
            username=username,
            password_hash=hash_password(password),
            email=email,
            full_name=full_name,
            role=role,
            is_active=is_active,
        )

    async def update(self, user_id: int, data: dict[str, Any]) -> asyncpg.Record:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError(f"User {user_id} not found")
        clean = {k: v for k, v in data.items() if v is not None}
        if "email" in clean:
            existing = await self.repo.get_by_email(clean["email"])
            if existing and existing["id"] != user_id:
                raise ConflictError(f"Email '{clean['email']}' already exists")
        if "password" in clean:
            clean["password_hash"] = hash_password(clean.pop("password"))
        if "role" in clean and hasattr(clean["role"], "value"):
            clean["role"] = clean["role"].value
        updated = await self.repo.update(user_id, clean)
        if not updated:
            raise NotFoundError(f"User {user_id} not found")
        return updated

    async def deactivate(self, user_id: int) -> None:
        if not await self.repo.deactivate(user_id):
            raise NotFoundError(f"User {user_id} not found")

    async def change_password(self, user_id: int, current: str, new: str) -> None:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise NotFoundError("User not found")
        if not verify_password(current, user["password_hash"]):
            raise AuthorizationError("Current password is incorrect")
        await self.repo.update(user_id, {"password_hash": hash_password(new)})
        await self.repo.increment_token_version(user_id)
