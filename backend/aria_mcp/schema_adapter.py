"""MCP → Anthropic tool-schema adapter (M2.7).

The MCP spec uses ``inputSchema`` (camelCase) and JSON Schema is the wire
format. The Anthropic Messages API expects ``input_schema`` (snake_case) and
constrains tool ``name`` to the regex ``^[a-zA-Z0-9_-]{1,64}$``.

This adapter performs:

1. **Rename** ``inputSchema → input_schema`` (required — the only documented
   schema-shape difference between the two specs).
2. **Validate** ``name`` against Anthropic's regex so a typo fails fast in the
   adapter instead of as a 400 from the Messages API.
3. **Defensive strip** of JSON Schema meta-keywords (``$ref``, ``$defs``,
   ``$schema``, ``$id``, ``definitions``). The Anthropic docs do not list
   these as forbidden, but FastMCP never emits them for our ``@mcp.tool()``
   functions either, so removing them is a no-op for the current tool surface
   and a safety net for any third-party tool mounted later.

References
----------
* MCP tool spec: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
* Anthropic tool definition fields:
  https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use
"""

from __future__ import annotations

import re
from typing import Any

# Anthropic's documented constraint on tool names.
_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")

# JSON Schema meta-keywords stripped defensively. FastMCP-generated schemas
# never include these, so the strip is a no-op in practice — but it keeps
# the adapter robust if a third-party MCP tool is mounted later.
_UNSUPPORTED_TOP_KEYS: frozenset[str] = frozenset(
    {"$ref", "$defs", "$schema", "$id", "definitions"}
)


def _sanitize_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Recursively strip Anthropic-incompatible JSON Schema constructs."""
    out: dict[str, Any] = {}
    for k, v in schema.items():
        if k in _UNSUPPORTED_TOP_KEYS:
            continue
        if isinstance(v, dict):
            out[k] = _sanitize_schema(v)
        elif isinstance(v, list):
            out[k] = [_sanitize_schema(x) if isinstance(x, dict) else x for x in v]
        else:
            out[k] = v
    return out


def mcp_to_anthropic(tool: dict[str, Any]) -> dict[str, Any]:
    """Convert one MCP tool descriptor to Anthropic tool format.

    Args:
        tool: A dict with at least ``name`` and ``inputSchema`` (the shape
            ``mcp.types.Tool.model_dump()`` produces).

    Returns:
        A dict with ``name``, ``description``, ``input_schema`` — ready to be
        included in ``anthropic.Messages.create(tools=[...])``.

    Raises:
        ValueError: If ``name`` or ``inputSchema`` is missing.
    """
    if "name" not in tool or not tool["name"]:
        raise ValueError("MCP tool descriptor missing required 'name'")
    if not _NAME_RE.match(tool["name"]):
        raise ValueError(
            f"MCP tool name {tool['name']!r} violates Anthropic regex " r"^[a-zA-Z0-9_-]{1,64}$"
        )
    schema = tool.get("inputSchema")
    if schema is None:
        raise ValueError(f"MCP tool '{tool['name']}' missing required 'inputSchema'")

    return {
        "name": tool["name"],
        "description": tool.get("description") or "",
        "input_schema": _sanitize_schema(schema),
    }
