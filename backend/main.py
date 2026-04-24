"""ARIA backend — FastAPI app entry point."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from agents.sentinel import forecast_watch_loop, sentinel_loop
from aria_mcp.server import http_app as mcp_http_app
from core.config import get_settings
from core.database import db
from core.exceptions import register_exception_handlers
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from modules.auth.router import router as auth_router
from modules.auth.user_router import router as user_router
from modules.chat.router import router as chat_router
from modules.events.router import router as events_router
from modules.hierarchy.router import router as hierarchy_router
from modules.kb.router import router as kb_router
from modules.kpi.router import router as kpi_router
from modules.logbook.router import router as logbook_router
from modules.mapping.router import router as mapping_router
from modules.monitoring.router import router as monitoring_router
from modules.shift.router import router as shift_router
from modules.signal.router import router as signal_router
from modules.work_order.router import router as work_order_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("aria.backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    app.state.db = db
    log.info("ARIA backend ready")
    async with mcp_http_app.lifespan(mcp_http_app):
        # Do NOT log the full mount path — the path secret is the only auth
        # when hosted MCP is enabled (#103 / M5.5). Log only that the server
        # is up.
        log.info("MCP server ready")
        # Sentinel must start INSIDE the MCP lifespan wrapper — its first
        # `mcp_client.call_tool()` hits 404 otherwise (MCP HTTP app not
        # yet mounted). See #26 audit comment.
        sentinel_task = asyncio.create_task(sentinel_loop(), name="sentinel")
        # M9 predictive-alerting loop — sibling to Sentinel. Runs in parallel
        # and emits ``forecast_warning`` events on projected threshold
        # breaches within the horizon. See ``agents.sentinel.forecast_watch_loop``.
        forecast_task = asyncio.create_task(forecast_watch_loop(), name="forecast-watch")
        try:
            yield
        finally:
            for task in (sentinel_task, forecast_task):
                task.cancel()
            for task in (sentinel_task, forecast_task):
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            log.info("Sentinel + forecast-watch cancelled")
            await db.disconnect()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="ARIA — Adaptive Runtime Intelligence for Industrial Assets",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    @app.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    # Routers
    app.include_router(auth_router)
    app.include_router(user_router)
    app.include_router(hierarchy_router)
    app.include_router(signal_router)
    app.include_router(kpi_router)
    app.include_router(monitoring_router)
    app.include_router(mapping_router)
    app.include_router(logbook_router)
    app.include_router(shift_router)
    app.include_router(work_order_router)
    app.include_router(kb_router)
    app.include_router(events_router)
    app.include_router(chat_router)

    if settings.aria_demo_enabled:
        # Demo-only routes (#29 memory-flex scene). Mounted behind a flag
        # so production deployments do not expose the scene triggers.
        from modules.demo.router import router as demo_router

        app.include_router(demo_router)
        log.info("Demo endpoints enabled at /api/v1/demo/*")

        # J-2 hackathon trigger — replay an existing WO through the full
        # Investigator agent so the demo can show Opus 4.7 extended
        # thinking on cue. Gated behind the same flag as the memory
        # scene; removable post-demo by unsetting ARIA_DEMO_ENABLED.
        from modules.debug.router import router as debug_router

        app.include_router(debug_router)
        log.info("Debug endpoints enabled at /api/v1/debug/*")

    # Mount MCP behind a path-secret gate so the tunneled URL carries its own
    # auth token (hosted MCP does not forward custom headers — see #103).
    # The legacy unsecured ``/mcp`` mount is only kept when hosted MCP is NOT
    # in use (no public URL configured). Once the tunnel is up, exposing both
    # mounts publicly would let callers strip the secret prefix and bypass
    # the gate entirely. Local dev / MCPClient should target
    # ``/mcp/<ARIA_MCP_PATH_SECRET>`` in that case.
    app.mount(f"/mcp/{settings.aria_mcp_path_secret}", mcp_http_app, name="mcp-secret")
    if not settings.aria_mcp_public_url:
        app.mount("/mcp", mcp_http_app)

    return app


app = create_app()
