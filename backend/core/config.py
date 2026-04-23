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

    # Routes Investigator through Claude Managed Agents (beta) instead of the
    # M4.5 Messages API agent loop. Off by default — M4.5 is the safe fallback
    # for demo day if Managed Agents misbehave (switch takes <5 min). See #103.
    investigator_use_managed: bool = False
    # Beta header the Managed Agents endpoints require. Pinned here so the
    # switch survives SDK upgrades until the feature goes GA.
    managed_agents_beta: str = "managed-agents-2026-04-01"

    # ── Managed Agents hosted-MCP wiring (#103 / M5.5) ──────────
    # 32-byte token that gates the MCP endpoint. Mount path becomes
    # ``/mcp/{aria_mcp_path_secret}`` so the URL itself is the secret.
    # Anthropic's ``mcp_servers`` config does not support custom HTTP
    # headers (docs: *"No auth tokens are provided at this stage."*) so
    # path-secret is the simplest implementable mitigation.
    aria_mcp_path_secret: str = "change-me-mcp-path-secret-32-bytes-min"
    # Public URL Anthropic's Managed Agents session calls to invoke MCP
    # tools. Must end with the path secret above (e.g.
    # ``https://<tunnel>.trycloudflare.com/mcp/<secret>``). Empty string
    # disables hosted-MCP wiring and the managed Investigator falls back
    # to wrapping MCP tools as custom tools.
    aria_mcp_public_url: str = ""

    @property
    def database_dsn(self) -> str:
        return (
            f"postgres://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
