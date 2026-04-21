"""Tiny helpers to convert asyncpg.Record → Pydantic → JSON-ready dict.

Used by routers to avoid repeating
    Model.model_validate(dict(record)).model_dump(mode="json")
in every endpoint.
"""

from __future__ import annotations

from typing import Iterable, Type, TypeVar

from pydantic import BaseModel

M = TypeVar("M", bound=BaseModel)


def serialize(model: Type[M], record) -> dict:
    """Convert a single asyncpg.Record (or mapping) to a JSON-ready dict."""
    return model.model_validate(dict(record)).model_dump(mode="json")


def serialize_list(model: Type[M], records: Iterable) -> list[dict]:
    return [serialize(model, r) for r in records]
