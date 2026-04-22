"""Smoke tests for ARIA MCP tool registration (M2.2).

Verifies the 4 KPI tools are registered on the FastMCP instance and have
the expected schemas — does not call them (that requires DB; integration test).
"""

from __future__ import annotations

import pytest


@pytest.mark.unit
@pytest.mark.asyncio
async def test_four_kpi_tools_registered():
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert {"get_oee", "get_mtbf", "get_mttr", "get_downtime_events"} <= names


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_oee_has_bucket_minutes_param():
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    schema = next(t for t in tools if t.name == "get_oee").parameters
    props = schema.get("properties", {})
    assert "bucket_minutes" in props
    assert "cell_ids" in props
    assert "window_start" in props
    assert "window_end" in props


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_downtime_events_has_categories_param():
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    schema = next(t for t in tools if t.name == "get_downtime_events").parameters
    assert "categories" in schema.get("properties", {})
