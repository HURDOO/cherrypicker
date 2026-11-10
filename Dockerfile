# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS dependencies

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

COPY . .
RUN npm run build

FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime

WORKDIR /app

# Keep public sign-up closed after the initial account bootstrap.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/cherrypicker.db \
    ALLOW_SIGN_UP=false \
    HOME=/tmp \
    NPM_CONFIG_CACHE=/tmp/npm-cache

LABEL org.opencontainers.image.source="https://github.com/HURDOO/cherrypicker"

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/drizzle.config.ts /app/next.config.ts /app/tsconfig.json ./

RUN chmod 0755 ./scripts/docker-entrypoint.sh \
    && rm -rf ./.next/cache \
    && ln -s /tmp/next-cache ./.next/cache

# The rootless Pi runtime deliberately runs container UID 0 so the process maps
# to the unprivileged host deployment user that owns the managed /data bind mount.
EXPOSE 3000
# deployd's `compose up --wait` waits for this (start period up to its startup timeout) before
# its own short health check, so a slow Pi start is not mistaken for a failed release.
HEALTHCHECK --interval=15s --timeout=5s --start-period=180s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
STOPSIGNAL SIGTERM

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
