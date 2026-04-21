#!/bin/sh
# ARIA — apply all .up.sql migration files in order to TimescaleDB.
# Tracks applied migrations via schema_migrations table so re-runs are safe.
set -eu

MIGRATIONS_DIR="$(cd "$(dirname "$0")" && pwd)/versions"

: "${POSTGRES_HOST:=timescaledb}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_USER:?POSTGRES_USER not set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set}"
: "${POSTGRES_DB:?POSTGRES_DB not set}"

export PGPASSWORD="$POSTGRES_PASSWORD"

echo "[migrate] waiting for $POSTGRES_HOST:$POSTGRES_PORT ..."
until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
    sleep 1
done
echo "[migrate] db ready"

psql_run() {
    psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" \
        -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

psql_run -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT NOW());" >/dev/null

for f in "$MIGRATIONS_DIR"/*.up.sql; do
    name="$(basename "$f")"
    already="$(psql_run -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$name';")"
    if [ "$already" = "1" ]; then
        echo "[migrate] skip $name (already applied)"
        continue
    fi
    echo "[migrate] applying $name"
    psql_run -f "$f"
    psql_run -c "INSERT INTO schema_migrations (filename) VALUES ('$name');" >/dev/null
done

echo "[migrate] done"
