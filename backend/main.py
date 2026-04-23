"""ARIA backend — FastAPI app entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from aria_mcp.server import http_app as mcp_http_app
from core.config import get_settings
from core.database import db
from core.exceptions import register_exception_handlers
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from modules.auth.router import router as auth_router
from modules.auth.user_router import router as user_router
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
        log.info("MCP server ready at /mcp")
        try:
            yield
        finally:
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

    app.mount("/mcp", mcp_http_app)

    return app


app = create_app()
