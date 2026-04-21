"""Helpers for JSON/JSONB columns stored as text by asyncpg.

When a column is `jsonb` and we don't register a codec, asyncpg returns it as a
`str`. These helpers normalise both directions:

  * `decode_record(record, fields)`  → dict with parsed JSON values
  * `encode_fields(fields_dict, fields)` → dict with JSON-encoded string values
"""

from __future__ import annotations

import json
from typing import Any, Iterable


def decode_record(record, json_fields: Iterable[str]) -> dict[str, Any]:
    d = dict(record)
    for k in json_fields:
        v = d.get(k)
        if isinstance(v, str):
            try:
                d[k] = json.loads(v)
            except (TypeError, ValueError):
                pass
    return d


def encode_fields(fields: dict[str, Any], json_fields: Iterable[str]) -> dict[str, Any]:
    out = dict(fields)
    for k in json_fields:
        if k in out and out[k] is not None and not isinstance(out[k], str):
            out[k] = json.dumps(out[k])
    return out
