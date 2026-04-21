"""Standard JSON envelope helpers: {status, message, data}."""

from __future__ import annotations

from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


def ok(data: Any = None, message: str = "OK", status: int = 200) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"status": status, "message": message, "data": jsonable_encoder(data)},
    )


def created(data: Any = None, message: str = "Created") -> JSONResponse:
    return ok(data, message=message, status=201)


def deleted(message: str = "Deleted") -> JSONResponse:
    return ok(None, message=message, status=200)
