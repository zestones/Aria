#!/bin/sh
# ARIA — apply all .up.sql migration files in order to TimescaleDB,
# then apply every seeds/*.sql (idempotent by construction — no version tracking).
# Migrations are tracked via schema_migrations so re-runs skip applied files.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/versions"
SEEDS_DIR="$SCRIPT_DIR/../seeds"

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

echo "[migrate] migrations done"

# ---- seeds (idempotent, always re-applied) ----
if [ -d "$SEEDS_DIR" ]; then
    for f in "$SEEDS_DIR"/*.sql; do
        [ -e "$f" ] || continue
        name="$(basename "$f")"
        echo "[seed] applying $name"
        psql_run -f "$f"
    done
    echo "[seed] done"
else
    echo "[seed] no seeds dir — skipping"
fi

