FROM ghcr.io/voidzero-dev/vite-plus:0.3.0@sha256:bca24ac970b21298430ad281f306dbe0a17be3fd1d6c9ec5f2cc73da65740b88 AS node-build

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
    apps/payments-stub/src/main.ts \
    --no-config \
    --platform node \
    --out-dir apps/payments-stub/dist \
    --clean \
    --sourcemap \
    --deps.always-bundle '/.*/'
RUN vp pack \
    apps/load-generator/src/main.ts \
    --no-config \
    --platform node \
    --out-dir apps/load-generator/dist \
    --clean \
    --sourcemap \
    --deps.always-bundle '/.*/'
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

FROM golang:1.25.14-alpine3.24@sha256:1ae0735f00daffa3aaf1363a5184c0d2dc55c78e3db4ec70241cdac97bf84b59 AS collector-build

ARG COLLECTOR_BUILDER_VERSION=v0.159.0

WORKDIR /src/apps/collector
COPY apps/collector/go.mod apps/collector/go.sum ./
RUN go mod download
COPY apps/collector/ ./
RUN go run go.opentelemetry.io/collector/cmd/builder@${COLLECTOR_BUILDER_VERSION} --config builder-config.yaml

FROM node:24.20.0-alpine3.23@sha256:0388af2af070cd4736a1567cfed02469ba117848845b4165d87a333edb53d2ca AS node-runtime

FROM clickhouse/clickhouse-server:25.8.33.6-alpine@sha256:87e0a5b72f5465b18eacca7c76850e7ff551c9795c50e451f5646299e5e24146 AS runtime

RUN apk add --no-cache --upgrade \
    ca-certificates \
    curl \
    libstdc++ \
    nginx \
    postgresql18 \
    postgresql18-client \
    su-exec \
    tini \
    'libcrypto3>=3.5.8-r0' \
    'libssl3>=3.5.8-r0' && \
    addgroup -S clear && \
    adduser -S -D -H -G clear clear

ENV CI=1 \
    NODE_ENV=production \
    PGDATA=/var/lib/postgresql/data

WORKDIR /workspace

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=collector-build /src/apps/collector/dist/clear-collector /usr/local/bin/clear-collector
COPY --from=node-build /workspace/apps/backend/dist ./apps/backend/dist
COPY --from=node-build /workspace/infra/docker/backend-entry.mjs ./apps/backend/dist/index.mjs
COPY --from=node-build /workspace/apps/payments-stub/dist ./apps/payments-stub/dist
COPY --from=node-build /workspace/apps/load-generator/dist ./apps/load-generator/dist
COPY --from=node-build /workspace/packages/persistence/dist ./packages/persistence/dist
COPY --from=node-build /workspace/packages/persistence/drizzle ./packages/persistence/drizzle
COPY --from=node-build /workspace/infra/clickhouse/migrations ./infra/clickhouse/migrations
COPY --from=node-build /workspace/infra/scripts/runtime/check-database-readiness.mjs ./infra/scripts/check-database-readiness.mjs
COPY --from=node-build /workspace/infra/scripts/run-migrations.sh ./infra/scripts/run-migrations.sh
COPY apps/collector/config/hosted-all-in-one.yaml /etc/groundtruth/collector.yaml
COPY infra/clickhouse/config.d/ /etc/clickhouse-server/config.d/
COPY infra/clickhouse/users.d/ /etc/clickhouse-server/users.d/
COPY infra/render/clickhouse-config.xml /etc/clickhouse-server/config.d/zz-clear-hosted.xml
COPY infra/render/clickhouse-users.xml /etc/clickhouse-server/users.d/zz-clear-hosted.xml
COPY infra/render/nginx.conf /etc/nginx/nginx.conf
COPY infra/render/start.sh /usr/local/bin/start-clear

RUN chmod 0755 /usr/local/bin/start-clear /usr/local/bin/clear-collector && \
    mkdir -p /run/nginx /var/lib/postgresql /var/lib/clickhouse && \
    chown -R postgres:postgres /var/lib/postgresql && \
    chown -R clickhouse:clickhouse /var/lib/clickhouse

EXPOSE 10000

STOPSIGNAL SIGTERM
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/start-clear"]
