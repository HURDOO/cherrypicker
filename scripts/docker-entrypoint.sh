#!/bin/sh

set -eu

if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
    echo "BETTER_AUTH_SECRET is required." >&2
    exit 1
fi

BETTER_AUTH_URL="${BETTER_AUTH_URL:-${APP_BASE_URL:-https://cherrypicker.app.hurdoo.kr}}"
export BETTER_AUTH_URL

if [ -f "${DATABASE_PATH}" ]; then
    backup_timestamp="$(date -u +%Y%m%dT%H%M%S%NZ)"
    npm run db:backup -- "/data/backups/pre-start-${backup_timestamp}.db"
fi

npm run db:setup

exec ./node_modules/.bin/next start --hostname "${HOSTNAME:-0.0.0.0}" --port "${PORT:-3000}"
