"""HTTP-only cookie helpers for access/refresh tokens."""

from __future__ import annotations

from fastapi import Request, Response

from core.security.jwt import access_ttl_seconds, refresh_ttl_seconds

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
REFRESH_PATH = "/api/v1/auth"


def set_auth_cookies(
    response: Response, access_token: str, refresh_token: str | None, *, secure: bool
) -> None:
    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        httponly=True,
        secure=secure,
        samesite="strict",
        max_age=access_ttl_seconds(),
        path="/",
    )
    if refresh_token is not None:
        response.set_cookie(
            REFRESH_COOKIE,
            refresh_token,
            httponly=True,
            secure=secure,
            samesite="strict",
            max_age=refresh_ttl_seconds(),
            path=REFRESH_PATH,
        )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_PATH)


def get_access_token(request: Request) -> str | None:
    return request.cookies.get(ACCESS_COOKIE)


def get_refresh_token(request: Request) -> str | None:
    return request.cookies.get(REFRESH_COOKIE)


def is_secure_request(request: Request) -> bool:
    return request.url.scheme == "https"
