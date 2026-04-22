"""Unit tests for the MCP→Anthropic schema adapter (issue #14)."""

from __future__ import annotations

import pytest
from aria_mcp.schema_adapter import mcp_to_anthropic


@pytest.mark.unit
def test_mcp_to_anthropic_simple_tool_round_trip():
    """A flat tool descriptor: rename inputSchema -> input_schema, keep rest."""
    mcp_tool = {
        "name": "get_oee",
        "description": "Compute OEE for a window.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "cell_ids": {"type": "array", "items": {"type": "integer"}},
                "window_start": {"type": "string"},
                "window_end": {"type": "string"},
            },
            "required": ["cell_ids", "window_start", "window_end"],
            "additionalProperties": False,
        },
    }

    out = mcp_to_anthropic(mcp_tool)

    assert out["name"] == "get_oee"
    assert out["description"] == "Compute OEE for a window."
    assert "input_schema" in out
    assert "inputSchema" not in out
    assert out["input_schema"]["required"] == ["cell_ids", "window_start", "window_end"]
    assert out["input_schema"]["properties"]["cell_ids"]["items"]["type"] == "integer"


@pytest.mark.unit
def test_mcp_to_anthropic_nested_strips_unsupported_and_keeps_optionals():
    """Nested schema: strip $ref/$defs, keep optional fields with no required entry."""
    mcp_tool = {
        "name": "update_equipment_kb",
        "description": "Patch an equipment KB document.",
        "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "$defs": {"Foo": {"type": "string"}},
            "type": "object",
            "properties": {
                "cell_id": {"type": "integer"},
                "structured_data_patch": {
                    "type": "object",
                    "properties": {
                        "thresholds": {
                            "$ref": "#/$defs/Foo",
                            "type": "object",
                            "additionalProperties": True,
                        },
                    },
                },
                "source": {"type": "string"},
            },
            "required": ["cell_id", "structured_data_patch"],
        },
    }

    out = mcp_to_anthropic(mcp_tool)
    schema = out["input_schema"]

    assert "$schema" not in schema
    assert "$defs" not in schema
    thresholds = schema["properties"]["structured_data_patch"]["properties"]["thresholds"]
    assert "$ref" not in thresholds
    assert thresholds["additionalProperties"] is True  # legitimate keyword preserved
    assert "source" in schema["properties"]
    assert schema["required"] == ["cell_id", "structured_data_patch"]


@pytest.mark.unit
def test_mcp_to_anthropic_rejects_missing_name():
    with pytest.raises(ValueError, match="missing required 'name'"):
        mcp_to_anthropic({"inputSchema": {"type": "object"}})


@pytest.mark.unit
def test_mcp_to_anthropic_rejects_missing_input_schema():
    with pytest.raises(ValueError, match="missing required 'inputSchema'"):
        mcp_to_anthropic({"name": "foo"})


@pytest.mark.unit
@pytest.mark.parametrize("bad_name", ["has spaces", "dot.name", "with/slash", "x" * 65, ""])
def test_mcp_to_anthropic_rejects_invalid_name_per_anthropic_regex(bad_name):
    """Anthropic tool name must match ^[a-zA-Z0-9_-]{1,64}$."""
    with pytest.raises(ValueError):
        mcp_to_anthropic({"name": bad_name, "inputSchema": {"type": "object"}})
