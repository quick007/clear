FROM clickhouse/clickhouse-server:25.8.33.6-alpine@sha256:87e0a5b72f5465b18eacca7c76850e7ff551c9795c50e451f5646299e5e24146

RUN apk add --no-cache --upgrade \
  'libcrypto3>=3.5.8-r0' \
  'libssl3>=3.5.8-r0'

COPY infra/clickhouse/config.d/ /etc/clickhouse-server/config.d/
COPY infra/clickhouse/users.d/ /etc/clickhouse-server/users.d/
