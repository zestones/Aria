"""Tests for the ``MCPClient`` singleton (issue #14).

Uses an in-process FastMCP server via the ``Client(FastMCP)`` transport so
the test does not require the real backend stack.
"""

from __future__ import annotations

import json

import pytest
from aria_mcp.client import MCPClient, ToolCallResult, mcp_client
from fastmcp import FastMCP


def _make_test_server() -> FastMCP:
    srv = FastMCP("aria-client-test")

    @srv.tool()
    async def echo(msg: str) -> dict:
        """Return the message back."""
        return {"echoed": msg}

    @srv.tool()
    async def boom() -> str:
        """Always fails — exercises is_error path."""
        raise RuntimeError("intentional failure")

    return srv


@pytest.mark.unit
def test_module_level_singleton_exists():
    """The audit requires a module-level ``mcp_client`` instance."""
    assert isinstance(mcp_client, MCPClient)
    assert mcp_client.url.endswith("/mcp/")


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_tools_schema_returns_anthropic_format():
    srv = _make_test_server()
    client = MCPClient(srv)  # type: ignore[arg-type] -- fastmcp accepts FastMCP directly

    schemas = await client.get_tools_schema()

    assert len(schemas) == 2
    by_name = {s["name"]: s for s in schemas}
    assert {"echo", "boom"} == set(by_name)
    assert "input_schema" in by_name["echo"]
    assert "inputSchema" not in by_name["echo"]
    assert by_name["echo"]["input_schema"]["properties"]["msg"]["type"] == "string"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_tools_schema_caches_result():
    srv = _make_test_server()
    client = MCPClient(srv)  # type: ignore[arg-type]

    first = await client.get_tools_schema()
    second = await client.get_tools_schema()

    assert first is second  # same cached object


@pytest.mark.unit
@pytest.mark.asyncio
async def test_call_tool_success_returns_serialized_content():
    srv = _make_test_server()
    client = MCPClient(srv)  # type: ignore[arg-type]

    result = await client.call_tool("echo", {"msg": "hello"})

    assert isinstance(result, ToolCallResult)
    assert result.is_error is False
    payload = json.loads(result.content)
    # FastMCP wraps non-dict scalar returns under "result"; dict returns pass through.
    assert payload == {"echoed": "hello"}


@pytest.mark.unit
@pytest.mark.asyncio
async def test_call_tool_tool_error_returns_is_error_true_not_raises():
    """Tool-side failures must NOT raise — orchestrator wraps as tool_result."""
    srv = _make_test_server()
    client = MCPClient(srv)  # type: ignore[arg-type]

    result = await client.call_tool("boom", {})

    assert isinstance(result, ToolCallResult)
    assert result.is_error is True
    assert "intentional failure" in result.content
