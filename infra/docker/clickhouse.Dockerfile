# syntax=docker/dockerfile:1.7

FROM clickhouse/clickhouse-server:25.8.33.6-alpine

COPY infra/clickhouse/config.d/ /etc/clickhouse-server/config.d/
COPY infra/clickhouse/users.d/ /etc/clickhouse-server/users.d/
