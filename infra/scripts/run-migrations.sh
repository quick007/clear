#!/bin/sh

set -eu

max_attempts="${GROUNDTRUTH_MIGRATION_MAX_ATTEMPTS:-30}" # 30 attempts
retry_delay="${GROUNDTRUTH_MIGRATION_RETRY_DELAY_SECONDS:-10}" # 10 seconds, five minutes total by default

run_with_retry() {
  label="$1"
  shift
  attempt=1

  while ! "$@"; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "$label migrations failed after $attempt attempts" >&2
      return 1
    fi

    echo "$label is not ready for migrations, retrying in $retry_delay seconds ($attempt/$max_attempts)" >&2
    sleep "$retry_delay"
    attempt=$((attempt + 1))
  done
}

run_with_retry "PostgreSQL" ./node_modules/.bin/vp run persistence#db:migrate
run_with_retry "ClickHouse" ./node_modules/.bin/vp run persistence#clickhouse:migrate
