#!/bin/sh

set -eu

max_attempts="${GROUNDTRUTH_MIGRATION_MAX_ATTEMPTS:-30}" # 30 attempts
retry_delay="${GROUNDTRUTH_MIGRATION_RETRY_DELAY_SECONDS:-10}" # 10 seconds, five minutes total by default

run_readiness_check() {
  label="$1"
  shift
  attempt=1

  while true; do
    if "$@"; then
      return 0
    else
      status="$?"
    fi

    if [ "$status" -ne 75 ]; then
      echo "$label readiness check failed with non-retryable status $status" >&2
      return "$status"
    fi

    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "$label was not ready after $attempt attempts" >&2
      return 1
    fi

    echo "$label is not ready, retrying in $retry_delay seconds ($attempt/$max_attempts)" >&2
    sleep "$retry_delay"
    attempt=$((attempt + 1))
  done
}

run_readiness_check "PostgreSQL" node infra/scripts/check-database-readiness.mjs postgres
node packages/persistence/dist/postgres/migrate.mjs

run_readiness_check "ClickHouse" node infra/scripts/check-database-readiness.mjs clickhouse
node packages/persistence/dist/clickhouse/migrate.mjs
