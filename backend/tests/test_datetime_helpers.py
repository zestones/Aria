"""Unit tests for core.datetime_helpers.parse_tz_aware."""

from __future__ import annotations

from datetime import timezone

import pytest
from core.datetime_helpers import parse_tz_aware


@pytest.mark.unit
def test_parse_tz_aware_accepts_z_suffix():
    dt = parse_tz_aware("2026-04-22T13:00:00Z")
    assert dt.tzinfo is not None
    assert dt.utcoffset() == timezone.utc.utcoffset(None)


@pytest.mark.unit
def test_parse_tz_aware_accepts_explicit_offset():
    dt = parse_tz_aware("2026-04-22T13:00:00+02:00")
    assert dt.tzinfo is not None
    offset = dt.utcoffset()
    assert offset is not None
    assert offset.total_seconds() == 7200


@pytest.mark.unit
def test_parse_tz_aware_rejects_naive():
    with pytest.raises(ValueError, match="timezone-naïve"):
        parse_tz_aware("2026-04-22T13:00:00")


@pytest.mark.unit
def test_parse_tz_aware_rejects_date_only():
    with pytest.raises(ValueError):
        parse_tz_aware("2026-04-22")
