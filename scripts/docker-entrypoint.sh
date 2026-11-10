#!/bin/sh

set -eu

if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
    echo "BETTER_AUTH_SECRET is required." >&2
    exit 1
fi

BETTER_AUTH_URL="${BETTER_AUTH_URL:-${APP_BASE_URL:-https://cherrypicker.app.hurdoo.kr}}"
export BETTER_AUTH_URL

if [ -f "${DATABASE_PATH}" ]; then
    # Back up before migrations. A plain restart skips the full copy, which takes minutes on the
    # Pi once the promotion history is in and outlasts the deploy health check. Catalog syncs
    # keep their own pre-change backups. Anything but "up to date" (exit 1) still backs up.
    pending_status=0
    node ./scripts/has-pending-migrations.mjs "${DATABASE_PATH}" || pending_status=$?
    if [ "${pending_status}" -ne 1 ]; then
        backup_timestamp="$(date -u +%Y%m%dT%H%M%S%NZ)"
        npm run db:backup -- "/data/backups/pre-start-${backup_timestamp}.db" --keep=10
    fi
fi

npm run db:setup

exec ./node_modules/.bin/next start --hostname "${HOSTNAME:-0.0.0.0}" --port "${PORT:-3000}"
