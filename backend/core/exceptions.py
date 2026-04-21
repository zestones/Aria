"""Domain exceptions and FastAPI exception handlers."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class DomainError(Exception):
    status_code: int = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    status_code = 404


class ConflictError(DomainError):
    status_code = 409


class AuthenticationError(DomainError):
    status_code = 401


class AuthorizationError(DomainError):
    status_code = 403


class ValidationFailedError(DomainError):
    status_code = 422


def _envelope(status: int, message: str, data=None) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"status": status, "message": message, "data": data}
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(_request: Request, exc: DomainError) -> JSONResponse:
        return _envelope(exc.status_code, exc.message)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _envelope(exc.status_code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _validation(_request: Request, exc: RequestValidationError) -> JSONResponse:
        details: dict[str, list[str]] = {}
        for err in exc.errors():
            loc = ".".join(str(p) for p in err["loc"][1:]) or str(err["loc"][0])
            details.setdefault(loc, []).append(err["msg"])
        return _envelope(422, "Validation failed", {"details": details})
