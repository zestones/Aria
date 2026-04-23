"""Test-suite-wide bootstrap.

Some test modules transitively import ``agents.anthropic_client`` (and thus
``core.config.get_settings``) which validates required environment variables
at import time. The dev environment doesn't ship a ``.env`` file, so we
inject placeholder values here before any test module is collected.

Real values come from ``.env`` in production / docker-compose runs — those
take precedence because pydantic-settings reads ``.env`` before this
fallback (env vars set here only fill blanks).
"""

from __future__ import annotations

import os

_DEFAULTS = {
    "POSTGRES_USER": "test",
    "POSTGRES_PASSWORD": "test",
    "POSTGRES_DB": "test",
    "JWT_SECRET_KEY": "test-secret-not-used-in-unit-tests",
}

for _key, _value in _DEFAULTS.items():
    os.environ.setdefault(_key, _value)
