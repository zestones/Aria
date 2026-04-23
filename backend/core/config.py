"""ARIA backend settings — sourced from environment variables (.env)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # ── Postgres ─────────────────────────────────────────
    postgres_host: str = "timescaledb"
    postgres_port: int = 5432
    postgres_user: str
    postgres_password: str
    postgres_db: str

    # ── JWT ─────────────────────────────────────────────
    jwt_secret_key: str
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 7

    # ── Misc ────────────────────────────────────────────
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    mcp_api_key: str = "change-me-mcp-api-key"

    # ── Anthropic ───────────────────────────────────────
    # ANTHROPIC_API_KEY is required at startup — Pydantic raises if missing.
    anthropic_api_key: str
    # Advisory toggle reserved for the final-day demo polish.
    # `model_for()` currently ignores this and routes per use case.
    aria_model: str = "sonnet"  # "sonnet" | "opus"

    @property
    def database_dsn(self) -> str:
        return (
            f"postgres://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
