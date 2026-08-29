FROM ghcr.io/voidzero-dev/vite-plus:0.3.0@sha256:bca24ac970b21298430ad281f306dbe0a17be3fd1d6c9ec5f2cc73da65740b88 AS build

WORKDIR /workspace

COPY --chown=vp:vp . .

RUN vp install --frozen-lockfile
RUN vp pack \
    apps/backend/src/index.ts \
    --no-config \
    --platform node \
    --out-dir apps/backend/dist \
    --clean \
    --sourcemap \
    --deps.always-bundle '/.*/' && \
    mv apps/backend/dist/index.mjs apps/backend/dist/backend.mjs
RUN vp pack \
    packages/persistence/src/postgres/migrate.ts \
    packages/persistence/src/clickhouse/migrate.ts \
    --no-config \
    --platform node \
    --out-dir packages/persistence/dist \
    --clean \
    --sourcemap \
    --deps.always-bundle '/.*/'
RUN vp pack \
    infra/scripts/check-database-readiness.mjs \
    --no-config \
    --platform node \
    --out-dir infra/scripts/runtime \
    --clean \
    --sourcemap \
    --deps.always-bundle '/.*/'

FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS runtime

ENV CI=1 \
    NODE_ENV=production

WORKDIR /workspace

COPY --chown=node:node --from=build /workspace/apps/backend/dist ./apps/backend/dist
COPY --chown=node:node --from=build /workspace/infra/docker/backend-entry.mjs ./apps/backend/dist/index.mjs
COPY --chown=node:node --from=build /workspace/packages/persistence/dist ./packages/persistence/dist
COPY --chown=node:node --from=build /workspace/packages/persistence/drizzle ./packages/persistence/drizzle
COPY --chown=node:node --from=build /workspace/infra/clickhouse/migrations ./infra/clickhouse/migrations
COPY --chown=node:node --from=build /workspace/infra/scripts/runtime/check-database-readiness.mjs ./infra/scripts/check-database-readiness.mjs
COPY --chown=node:node --from=build /workspace/infra/scripts/runtime/check-database-readiness.mjs.map ./infra/scripts/check-database-readiness.mjs.map
COPY --chown=node:node --from=build /workspace/infra/scripts/run-migrations.sh ./infra/scripts/run-migrations.sh

USER node

STOPSIGNAL SIGTERM
