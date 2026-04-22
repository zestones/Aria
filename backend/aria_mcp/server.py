"""FastMCP server instance — ARIA tools are registered in sub-modules."""

from __future__ import annotations

from fastmcp import FastMCP

# Module-level MCP instance — imported by tool modules to register @mcp.tool()
mcp = FastMCP("aria-tools")

# ASGI sub-app using streamable-HTTP transport, mounted at /mcp in main.py
http_app = mcp.http_app(transport="streamable-http", path="/")
