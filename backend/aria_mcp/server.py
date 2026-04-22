"""FastMCP server instance — ARIA tools are registered in sub-modules."""

from __future__ import annotations

from fastmcp import FastMCP

# Module-level MCP instance — imported by tool modules to register @mcp.tool()
mcp = FastMCP("aria-tools")

# Register tools (import side-effect runs the @mcp.tool() decorators).
from aria_mcp import tools as _tools  # noqa: E402

_ = _tools  # silence unused-import linters; we need the import for side effects

# ASGI sub-app using streamable-HTTP transport, mounted at /mcp in main.py
http_app = mcp.http_app(transport="streamable-http", path="/")
