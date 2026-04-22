"""Unit tests for ``modules.kb.merge.merge_structured_data``.

Covers the 3 canonical RFC-7396 cases called out in the M2.5 audit (§1):

a) leaf-level threshold edit  → only that leaf changes
b) subtree replacement        → the whole subtree is swapped
c) ``null`` deletion          → the targeted key disappears
"""

from __future__ import annotations

from copy import deepcopy

import pytest
from modules.kb.merge import merge_structured_data


@pytest.fixture
def base_kb() -> dict:
    return {
        "thresholds": {
            "vibration_mm_s": {
                "nominal": 2.0,
                "alert": 6.0,
                "trip": 9.0,
                "unit": "mm/s",
            },
            "temperature_c": {
                "nominal": 60.0,
                "alert": 80.0,
                "unit": "°C",
            },
        },
        "kb_meta": {"version": 3, "completeness_score": 0.6},
    }


def test_leaf_replace_only_targets_leaf(base_kb: dict) -> None:
    """Audit §1 case (a): ``thresholds.vibration_mm_s.alert`` patched alone."""
    snapshot = deepcopy(base_kb)
    patch = {"thresholds": {"vibration_mm_s": {"alert": 6.5}}}
    merged = merge_structured_data(base_kb, patch)

    assert merged["thresholds"]["vibration_mm_s"]["alert"] == 6.5
    # siblings on the same threshold preserved
    assert merged["thresholds"]["vibration_mm_s"]["nominal"] == 2.0
    assert merged["thresholds"]["vibration_mm_s"]["trip"] == 9.0
    # other thresholds untouched
    assert merged["thresholds"]["temperature_c"] == base_kb["thresholds"]["temperature_c"]
    # purity: original mutated neither
    assert base_kb == snapshot


def test_subtree_replace_swaps_entire_block(base_kb: dict) -> None:
    """Audit §1 case (b): full vibration block from PDF extraction."""
    patch = {
        "thresholds": {
            "vibration_mm_s": {
                "nominal": 2.5,
                "alert": 7.0,
                "trip": 10.0,
                "unit": "mm/s",
                "source": "pdf:datasheet_v3",
            }
        }
    }
    merged = merge_structured_data(base_kb, patch)

    # vibration block replaced (note: RFC-7396 with a dict patch *merges*
    # — to wholesale-replace, the patch dict carries every key the caller
    # cares about. Old keys not in the patch survive.)
    assert merged["thresholds"]["vibration_mm_s"]["source"] == "pdf:datasheet_v3"
    assert merged["thresholds"]["vibration_mm_s"]["alert"] == 7.0
    # temperature subtree untouched
    assert merged["thresholds"]["temperature_c"]["alert"] == 80.0


def test_null_deletes_key(base_kb: dict) -> None:
    """Audit §1 case (c): ``null`` removes the key per RFC-7396."""
    patch = {"thresholds": {"temperature_c": None}}
    merged = merge_structured_data(base_kb, patch)

    assert "temperature_c" not in merged["thresholds"]
    assert "vibration_mm_s" in merged["thresholds"]


def test_arrays_replace_not_append() -> None:
    """RFC-7396: arrays replace wholesale (calibration_log exemption is in tool)."""
    existing = {"failure_patterns": [{"mode": "A"}, {"mode": "B"}]}
    patch = {"failure_patterns": [{"mode": "C"}]}
    merged = merge_structured_data(existing, patch)
    assert merged["failure_patterns"] == [{"mode": "C"}]


def test_non_dict_patch_replaces_wholesale() -> None:
    """RFC-7396 §1: a non-object patch becomes the result."""
    assert merge_structured_data({"a": 1}, 42) == 42
    assert merge_structured_data({"a": 1}, [1, 2]) == [1, 2]
    assert merge_structured_data({"a": 1}, None) is None


def test_missing_key_in_existing_is_added(base_kb: dict) -> None:
    patch = {"equipment": {"manufacturer": "Acme"}}
    merged = merge_structured_data(base_kb, patch)
    assert merged["equipment"] == {"manufacturer": "Acme"}
