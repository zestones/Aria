"""Unit tests for agents.ui_tools (issue #16 — M2.9)."""

from __future__ import annotations

import pytest
from agents.ui_tools import (
    ALERT_BANNER_SCHEMA,
    ALL_LLM_RENDER_TOOLS,
    INVESTIGATOR_RENDER_TOOLS,
    KB_BUILDER_RENDER_TOOLS,
    QA_RENDER_TOOLS,
    RENDER_BAR_CHART,
    RENDER_DIAGNOSTIC_CARD,
    RENDER_EQUIPMENT_KB_CARD,
    RENDER_KB_PROGRESS,
    RENDER_PATTERN_MATCH,
    RENDER_SIGNAL_CHART,
    RENDER_WORK_ORDER_CARD,
    WORK_ORDER_GEN_RENDER_TOOLS,
)

_REQUIRED_TOP_KEYS = {"name", "description", "input_schema"}


def _assert_anthropic_format(tool: dict) -> None:
    """Every LLM tool must be valid Anthropic tool format."""
    assert _REQUIRED_TOP_KEYS <= set(
        tool
    ), f"{tool.get('name', '<unknown>')}: missing keys {_REQUIRED_TOP_KEYS - set(tool)}"
    schema = tool["input_schema"]
    assert schema.get("type") == "object", f"{tool['name']}: input_schema.type must be 'object'"
    assert "properties" in schema, f"{tool['name']}: input_schema must have properties"
    # Must not contain MCP-only keys
    for bad_key in ("inputSchema", "$defs", "$schema"):
        assert (
            bad_key not in schema
        ), f"{tool['name']}: input_schema contains forbidden key {bad_key!r}"


@pytest.mark.unit
def test_all_llm_render_tools_are_anthropic_format():
    """Every tool in ALL_LLM_RENDER_TOOLS is a valid Anthropic tool descriptor."""
    # 7 original LLM render tools (render_correlation_matrix dropped per audit
    # §2) + render_sandbox_execution (M5.7 / #105) = 8.
    assert len(ALL_LLM_RENDER_TOOLS) == 8, (
        "Expected 8 LLM render tools: 7 original + render_sandbox_execution (M5.7 / #105)"
    )
    for tool in ALL_LLM_RENDER_TOOLS:
        _assert_anthropic_format(tool)


@pytest.mark.unit
def test_render_correlation_matrix_absent():
    """render_correlation_matrix must be absent — LLM would hallucinate its data."""
    names = {t["name"] for t in ALL_LLM_RENDER_TOOLS}
    assert "render_correlation_matrix" not in names


@pytest.mark.unit
def test_alert_banner_schema_not_in_llm_tools():
    """ALERT_BANNER_SCHEMA must NOT appear in any agent LLM list (Sentinel-only)."""
    all_names = {t["name"] for t in ALL_LLM_RENDER_TOOLS}
    assert ALERT_BANNER_SCHEMA["name"] not in all_names
    for agent_list in (
        INVESTIGATOR_RENDER_TOOLS,
        QA_RENDER_TOOLS,
        KB_BUILDER_RENDER_TOOLS,
        WORK_ORDER_GEN_RENDER_TOOLS,
    ):
        assert ALERT_BANNER_SCHEMA["name"] not in {t["name"] for t in agent_list}


@pytest.mark.unit
def test_cell_id_present_in_required_render_tools():
    """Tools where cell_id must be required (all except render_bar_chart where it's optional)."""
    required_cell_id_tools = [
        RENDER_SIGNAL_CHART,
        RENDER_EQUIPMENT_KB_CARD,
        RENDER_WORK_ORDER_CARD,
        RENDER_DIAGNOSTIC_CARD,
        RENDER_PATTERN_MATCH,
        RENDER_KB_PROGRESS,
    ]
    for tool in required_cell_id_tools:
        schema = tool["input_schema"]
        assert "cell_id" in schema["properties"], f"{tool['name']}: cell_id missing from properties"
        assert "cell_id" in schema.get(
            "required", []
        ), f"{tool['name']}: cell_id must be in required"


@pytest.mark.unit
def test_render_bar_chart_has_cell_id_as_optional():
    """render_bar_chart has cell_id as an optional prop (Q&A can produce general charts)."""
    schema = RENDER_BAR_CHART["input_schema"]
    assert "cell_id" in schema["properties"]
    assert "cell_id" not in schema.get("required", [])


@pytest.mark.unit
def test_per_agent_collections_are_subsets_of_all_llm_tools():
    all_names = {t["name"] for t in ALL_LLM_RENDER_TOOLS}
    for agent_list in (
        INVESTIGATOR_RENDER_TOOLS,
        QA_RENDER_TOOLS,
        KB_BUILDER_RENDER_TOOLS,
        WORK_ORDER_GEN_RENDER_TOOLS,
    ):
        for tool in agent_list:
            assert (
                tool["name"] in all_names
            ), f"{tool['name']} is in an agent list but not in ALL_LLM_RENDER_TOOLS"


@pytest.mark.unit
def test_investigator_has_diagnostic_and_signal_tools():
    names = {t["name"] for t in INVESTIGATOR_RENDER_TOOLS}
    assert {"render_diagnostic_card", "render_signal_chart", "render_pattern_match"} <= names


@pytest.mark.unit
def test_kb_builder_has_kb_tools():
    names = {t["name"] for t in KB_BUILDER_RENDER_TOOLS}
    assert {"render_equipment_kb_card", "render_kb_progress"} <= names
