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


@pytest.mark.unit
@pytest.mark.asyncio
async def test_signal_tools_registered():
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert {"get_signal_trends", "get_signal_anomalies", "get_current_signals"} <= names


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_signal_trends_uses_plural_signal_def_ids():
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    schema = next(t for t in tools if t.name == "get_signal_trends").parameters
    props = schema.get("properties", {})
    assert "signal_def_ids" in props, "audit §1: must accept multiple signals"
    assert "aggregation" in props


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_signal_anomalies_takes_cell_id():
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    schema = next(t for t in tools if t.name == "get_signal_anomalies").parameters
    props = schema.get("properties", {})
    assert "cell_id" in props
    assert "window_start" in props
    assert "window_end" in props


@pytest.mark.unit
@pytest.mark.asyncio
async def test_context_tools_registered():
    """M2.4 (issue #11) — 3 human-context tools wired on the MCP instance."""
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert {"get_logbook_entries", "get_shift_assignments", "get_work_orders"} <= names


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_shift_assignments_takes_date_range():
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    schema = next(t for t in tools if t.name == "get_shift_assignments").parameters
    props = schema.get("properties", {})
    assert {"cell_id", "date_start", "date_end"} <= set(props)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_work_orders_has_audit_filters():
    """Audit §1.2: priority + generated_by_agent filters wired."""
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    schema = next(t for t in tools if t.name == "get_work_orders").parameters
    props = schema.get("properties", {})
    assert {
        "cell_id",
        "status",
        "date_start",
        "date_end",
        "priority",
        "generated_by_agent",
    } <= set(props)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_list_cells_registered():
    """Audit §3: list_cells needed by Q&A agent (M5.x) for name → id resolution."""
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert "list_cells" in names
    schema = next(t for t in await mcp.list_tools() if t.name == "list_cells").parameters
    assert "site_id" in schema.get("properties", {})


@pytest.mark.unit
@pytest.mark.asyncio
async def test_kb_tools_registered():
    """M2.5 (issue #12) — 3 KB tools wired on the MCP instance."""
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert {"get_equipment_kb", "get_failure_history", "update_equipment_kb"} <= names


@pytest.mark.unit
@pytest.mark.asyncio
async def test_update_equipment_kb_required_params():
    """Audit M2.5 §1-§2: write tool exposes the contract params."""
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    schema = next(t for t in tools if t.name == "update_equipment_kb").parameters
    props = schema.get("properties", {})
    required = set(schema.get("required", []))
    assert {"cell_id", "structured_data_patch", "source", "calibrated_by"} <= set(props)
    assert {"cell_id", "structured_data_patch", "source", "calibrated_by"} <= required


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_failure_history_has_limit_param():
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    schema = next(t for t in tools if t.name == "get_failure_history").parameters
    props = schema.get("properties", {})
    assert {"cell_id", "limit"} <= set(props)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_production_tools_registered():
    """M2.6 (issue #13) — 2 production tools wired on the MCP instance."""
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    names = {t.name for t in tools}
    assert {"get_quality_metrics", "get_production_stats"} <= names


@pytest.mark.unit
@pytest.mark.asyncio
async def test_production_tools_have_required_params():
    """Audit M2.6: both tools share the same cell_ids + window signature."""
    from aria_mcp.server import mcp

    tools = await mcp.list_tools()
    for name in ("get_quality_metrics", "get_production_stats"):
        schema = next(t for t in tools if t.name == name).parameters
        props = schema.get("properties", {})
        assert {"cell_ids", "window_start", "window_end"} <= set(
            props
        ), f"{name} is missing required params"
