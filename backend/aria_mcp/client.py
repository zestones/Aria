"""MCP HTTP client singleton for ARIA agents (M2.7 — issue #14).

A thin wrapper around ``fastmcp.Client`` that:

* Opens a **fresh HTTP connection per call** (avoids the persistent-session
  closure bug noted in ``technical.md`` §2.2; overhead ~5–15 ms on localhost).
* Caches the discovered tool schemas in memory (tools are declared once at
  startup, never mutate).
* Returns a small ``ToolCallResult`` dataclass instead of raising for
  tool-side errors — so the orchestrator can wrap them into Anthropic
  ``tool_result`` blocks with ``is_error: true``. Transport failures
  (connection refused, timeout, HTTP 5xx) **do** raise — those are
  infrastructure, not tool, failures.

Usage
-----
    from aria_mcp.client import mcp_client

    schemas = await mcp_client.get_tools_schema()  # Anthropic format
    result = await mcp_client.call_tool("get_oee", {...})
    if result.is_error:
        ...  # forward to LLM as tool_result with is_error=True
    else:
        text = result.content
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from aria_mcp.schema_adapter import mcp_to_anthropic
from fastmcp import Client


@dataclass(frozen=True)
class ToolCallResult:
    """Outcome of a single ``call_tool`` invocation.

    Attributes:
        content: Serialized text payload (already JSON-stringified for
            structured tool outputs). Safe to pass straight into an Anthropic
            ``tool_result`` block as ``content``.
        is_error: ``True`` when the tool itself signalled an error (validation,
            domain failure, etc.). The orchestrator should set
            ``tool_result.is_error = True`` so the LLM can self-correct.
    """

    content: str
    is_error: bool


class MCPClient:
    """Singleton MCP client. Connection-per-call, in-memory schema cache."""

    def __init__(self, url: str) -> None:
        self._url = url
        self._tools_cache: list[dict[str, Any]] | None = None

    @property
    def url(self) -> str:
        return self._url

    async def get_tools_schema(self) -> list[dict[str, Any]]:
        """Discover server tools, convert to Anthropic format, cache result.

        Subsequent calls return the cached list. Tools are declared via
        ``@mcp.tool()`` at server startup and never change at runtime, so a
        process-lifetime cache is safe.
        """
        if self._tools_cache is not None:
            return self._tools_cache

        async with Client(self._url) as client:
            tools = await client.list_tools()

        self._tools_cache = [mcp_to_anthropic(t.model_dump()) for t in tools]
        return self._tools_cache

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> ToolCallResult:
        """Invoke a tool over a fresh HTTP connection.

        Args:
            name: Tool name as registered on the server.
            arguments: JSON-serializable arguments matching the tool's schema.

        Returns:
            A :class:`ToolCallResult`. ``is_error=True`` when the tool reported
            a failure (server-side ``isError`` flag); the LLM should be allowed
            to recover.

        Raises:
            Exception: For transport-level failures (connection refused, HTTP
                5xx, timeout). These propagate so the orchestrator can decide
                whether to retry vs. surface a fatal infrastructure error.
        """
        async with Client(self._url) as client:
            result = await client.call_tool(name, arguments, raise_on_error=False)

        # Prefer the JSON-serializable structured payload when the tool emits
        # one (FastMCP wraps non-object returns — including ``list[dict]`` —
        # as ``{"result": ...}``; unwrap so callers receive the native shape
        # the tool's type-hint advertises). Fall back to the first text block.
        if result.structured_content is not None:
            import json

            payload = result.structured_content
            if isinstance(payload, dict) and set(payload.keys()) == {"result"}:
                payload = payload["result"]
            text = json.dumps(payload, default=str)
        elif result.content:
            first = result.content[0]
            text = getattr(first, "text", "") or ""
        else:
            text = ""

        return ToolCallResult(content=text, is_error=bool(result.is_error))

    def invalidate_cache(self) -> None:
        """Drop the cached tool schemas. Intended for tests."""
        self._tools_cache = None


# Module-level singleton. ``ARIA_MCP_URL`` overrides the default for tests /
# external (Claude Desktop) consumers. The trailing slash matches the
# streamable-http endpoint mounted in ``main.py``.
_DEFAULT_URL = os.environ.get("ARIA_MCP_URL", "http://localhost:8000/mcp/")
mcp_client = MCPClient(_DEFAULT_URL)
