"""User repository (asyncpg)."""

from __future__ import annotations

from typing import Any

import asyncpg
from core.db_helpers import must


class UserRepository:
    def __init__(self, conn: asyncpg.Connection) -> None:
        self.conn = conn

    _COLS = (
        "id, username, password_hash, email, full_name, role, is_active, "
        "token_version, created_at, updated_at, last_login"
    )

    async def get_by_id(self, user_id: int) -> asyncpg.Record | None:
        return await self.conn.fetchrow(f"SELECT {self._COLS} FROM users WHERE id = $1", user_id)

    async def get_by_username(self, username: str) -> asyncpg.Record | None:
        return await self.conn.fetchrow(
            f"SELECT {self._COLS} FROM users WHERE username = $1", username
        )

    async def get_by_email(self, email: str) -> asyncpg.Record | None:
        return await self.conn.fetchrow(f"SELECT {self._COLS} FROM users WHERE email = $1", email)

    async def list_all(self, *, include_inactive: bool = False) -> list[asyncpg.Record]:
        if include_inactive:
            return await self.conn.fetch(f"SELECT {self._COLS} FROM users ORDER BY id")
        return await self.conn.fetch(
            f"SELECT {self._COLS} FROM users WHERE is_active = TRUE ORDER BY id"
        )

    async def create(
        self,
        *,
        username: str,
        password_hash: str,
        email: str | None,
        full_name: str | None,
        role: str,
        is_active: bool,
    ) -> asyncpg.Record:
        return must(
            await self.conn.fetchrow(
                f"""
                INSERT INTO users (username, password_hash, email, full_name, role, is_active)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING {self._COLS}
                """,
                username,
                password_hash,
                email,
                full_name,
                role,
                is_active,
            )
        )

    async def update(self, user_id: int, fields: dict[str, Any]) -> asyncpg.Record | None:
        if not fields:
            return await self.get_by_id(user_id)
        set_clauses = []
        values: list[Any] = []
        for i, (col, val) in enumerate(fields.items(), start=1):
            set_clauses.append(f"{col} = ${i}")
            values.append(val)
        set_clauses.append("updated_at = NOW()")
        values.append(user_id)
        sql = (
            f"UPDATE users SET {', '.join(set_clauses)} "
            f"WHERE id = ${len(values)} RETURNING {self._COLS}"
        )
        return await self.conn.fetchrow(sql, *values)

    async def deactivate(self, user_id: int) -> bool:
        result = await self.conn.execute(
            "UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1",
            user_id,
        )
        return result.endswith(" 1")

    async def update_last_login(self, user_id: int) -> None:
        await self.conn.execute("UPDATE users SET last_login = NOW() WHERE id = $1", user_id)

    async def increment_token_version(self, user_id: int) -> None:
        await self.conn.execute(
            "UPDATE users SET token_version = token_version + 1 WHERE id = $1",
            user_id,
        )
