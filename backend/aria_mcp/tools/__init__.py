"""ARIA MCP tools — submodules import this package to register on ``mcp``.

Importing this package triggers all ``@mcp.tool()`` decorators via the
sub-module imports below. Order is irrelevant; each module is independent.
"""

from __future__ import annotations

from aria_mcp.tools import kpi, signals  # noqa: F401  side-effect imports
