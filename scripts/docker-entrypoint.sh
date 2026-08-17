#!/bin/sh

set -eu

if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
    echo "BETTER_AUTH_SECRET is required." >&2
    exit 1
fi

BETTER_AUTH_URL="${BETTER_AUTH_URL:-https://cherrypicker-promotion.app.hurdoo.kr}"
export BETTER_AUTH_URL

npm run db:setup

exec ./node_modules/.bin/next start --hostname "${HOSTNAME:-0.0.0.0}" --port "${PORT:-3000}"
