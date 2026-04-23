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
    # Optional at startup so the backend boots without a key. Agent code
    # that actually calls Claude (extract_from_pdf, investigator, etc.)
    # must guard on truthiness and raise a clear error when invoked.
    anthropic_api_key: str = ""
    # Advisory toggle reserved for the final-day demo polish.
    # `model_for()` currently ignores this and routes per use case.
    aria_model: str = "sonnet"  # "sonnet" | "opus"

    # Mounts `modules.demo.router` when true — off by default so production
    # deployments do not expose `/api/v1/demo/trigger-memory-scene`. See #29.
    aria_demo_enabled: bool = False

    # Routes Q&A through Claude Managed Agents (beta) instead of the M5.2
    # Messages API agent loop. Off by default — M5.2 is the safe fallback for
    # demo day if Managed Agents misbehave (switch takes <5 min). See #33.
    use_managed_agents: bool = False
    # Beta header the Managed Agents endpoints require. Pinned here so the
    # switch survives SDK upgrades until the feature goes GA.
    managed_agents_beta: str = "managed-agents-2026-04-01"

    @property
    def database_dsn(self) -> str:
        return (
            f"postgres://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
