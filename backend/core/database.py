"""asyncpg connection pool — single global pool managed by app lifespan."""

from __future__ import annotations

import logging
from typing import AsyncIterator

import asyncpg
from core.config import get_settings
from fastapi import Request

log = logging.getLogger(__name__)


class Database:
    """Wrapper around asyncpg.Pool with lazy init."""

    def __init__(self) -> None:
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        if self._pool is not None:
            return
        s = get_settings()
        log.info(
            "connecting asyncpg pool to %s:%s/%s",
            s.postgres_host,
            s.postgres_port,
            s.postgres_db,
        )
        self._pool = await asyncpg.create_pool(
            host=s.postgres_host,
            port=s.postgres_port,
            user=s.postgres_user,
            password=s.postgres_password,
            database=s.postgres_db,
            min_size=2,
            max_size=20,
            command_timeout=30,
        )

    async def disconnect(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("database pool not initialised")
        return self._pool


# Global singleton — set on app.state.db in main.py
db = Database()


async def get_db(request: Request) -> AsyncIterator[asyncpg.Connection]:
    """FastAPI dependency: acquire a connection from the pool for the request."""
    pool: asyncpg.Pool = request.app.state.db.pool
    async with pool.acquire() as conn:
        yield conn
