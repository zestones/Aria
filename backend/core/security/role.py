"""Roles enum + helpers."""

from enum import Enum


class Role(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"

    @classmethod
    def from_str(cls, value: str) -> "Role":
        try:
            return cls(value)
        except ValueError as exc:
            raise ValueError(f"Invalid role '{value}'") from exc
