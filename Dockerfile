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

# Bootstrap release only: restore this to false immediately after creating the first account.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/cherrypicker.db \
    ALLOW_SIGN_UP=true \
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
STOPSIGNAL SIGTERM

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
