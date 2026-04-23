"""Regression — /api/v1/hierarchy/* must require authentication.

Audit finding P1 (post-M7.4): the hierarchy router had no auth gate, so
GET /api/v1/hierarchy/tree returned 200 without a session cookie. Every
other domain router (``kb``, ``logbook``, ``signal``, ...) declares
``dependencies=[Depends(get_current_user)]`` at the router level; this
test pins that invariant so the gap cannot silently reappear.
"""

from __future__ import annotations

from fastapi import Depends

from core.security import get_current_user
from modules.hierarchy.router import router


def _declared_deps(router_obj) -> list:
    return list(getattr(router_obj, "dependencies", []) or [])


def test_hierarchy_router_declares_get_current_user_dependency() -> None:
    deps = _declared_deps(router)
    # Each entry is a ``fastapi.params.Depends`` whose ``dependency`` attribute
    # is the callable. The router-level gate must include ``get_current_user``.
    callables = [getattr(d, "dependency", None) for d in deps]
    assert get_current_user in callables, (
        "hierarchy router must declare dependencies=[Depends(get_current_user)] "
        "at the APIRouter level — otherwise GET /tree is public (P1)"
    )


def test_dependency_uses_fastapi_depends_wrapper() -> None:
    # Sanity: the entry is the correct ``Depends(...)`` shape, not a bare
    # callable (which FastAPI would silently ignore at router level).
    sentinel = Depends(get_current_user)
    deps = _declared_deps(router)
    assert any(type(d) is type(sentinel) for d in deps)
