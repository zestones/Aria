"""FastAPI auth dependencies: get_current_user, require_role."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Request

from core.exceptions import AuthenticationError, AuthorizationError
from core.security.cookies import get_access_token
from core.security.jwt import verify_access_token
from core.security.role import Role


@dataclass
class CurrentUser:
    user_id: int
    username: str
    role: Role


def get_current_user(request: Request) -> CurrentUser:
    token = get_access_token(request)
    if not token:
        raise AuthenticationError("Authentication required")
    payload = verify_access_token(token)
    if not payload:
        raise AuthenticationError("Invalid or expired access token")
    return CurrentUser(
        user_id=int(payload["sub"]),
        username=payload["username"],
        role=Role.from_str(payload["role"]),
    )


def require_role(*allowed: Role):
    """Return a dependency that checks the current user has one of *allowed* roles."""

    def _checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed:
            raise AuthorizationError(f"Requires one of roles: {[r.value for r in allowed]}")
        return user

    return _checker
