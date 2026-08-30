#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly postgres_data="${PGDATA:-/var/lib/postgresql/data}"
readonly postgres_password="${GROUNDTRUTH_POSTGRES_PASSWORD:?GROUNDTRUTH_POSTGRES_PASSWORD is required}"
readonly clickhouse_password="${GROUNDTRUTH_CLICKHOUSE_PASSWORD:?GROUNDTRUTH_CLICKHOUSE_PASSWORD is required}"
readonly demo_ingest_key="${GROUNDTRUTH_DEMO_INGEST_KEY:?GROUNDTRUTH_DEMO_INGEST_KEY is required}"
declare -a service_pids=()

terminate_services() {
  trap - SIGINT SIGTERM EXIT
  if ((${#service_pids[@]} > 0)); then
    kill -TERM "${service_pids[@]}" 2>/dev/null || true
    wait "${service_pids[@]}" 2>/dev/null || true
  fi
}

trap terminate_services SIGINT SIGTERM EXIT

wait_for_command() {
  local label="$1"
  shift

  for _attempt in $(seq 1 60); do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "$label did not become ready within 60 seconds" >&2
  return 1
}

start_postgres() {
  mkdir -p "$postgres_data" /run/postgresql
  chown -R postgres:postgres /var/lib/postgresql /run/postgresql

  if [[ ! -s "$postgres_data/PG_VERSION" ]]; then
    printf '%s\n' "$postgres_password" >/tmp/postgres-password
    chown postgres:postgres /tmp/postgres-password
    su-exec postgres initdb \
      --pgdata="$postgres_data" \
      --username=groundtruth \
      --pwfile=/tmp/postgres-password \
      --auth-host=scram-sha-256 \
      --auth-local=trust
    rm -f /tmp/postgres-password
  fi

  su-exec postgres postgres \
    --config-file="$postgres_data/postgresql.conf" \
    -c listen_addresses=127.0.0.1 \
    -c max_connections=30 \
    -c shared_buffers=64MB \
    -c work_mem=2MB \
    -c maintenance_work_mem=32MB \
    -c effective_cache_size=256MB &
  service_pids+=("$!")

  wait_for_command "PostgreSQL" pg_isready --host 127.0.0.1 --port 5432 --username groundtruth
  export PGPASSWORD="$postgres_password"
  if ! psql --host 127.0.0.1 --username groundtruth --dbname postgres --tuples-only \
    --command "SELECT 1 FROM pg_database WHERE datname = 'groundtruth'" | grep -q 1; then
    createdb --host 127.0.0.1 --username groundtruth groundtruth
  fi
}

start_clickhouse() {
  mkdir -p /var/lib/clickhouse
  chown -R clickhouse:clickhouse /var/lib/clickhouse
  export CLICKHOUSE_DB=groundtruth
  export CLICKHOUSE_USER=groundtruth
  export CLICKHOUSE_PASSWORD="$clickhouse_password"
  export CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1
  (umask 022; /entrypoint.sh) &
  service_pids+=("$!")

  wait_for_command "ClickHouse" clickhouse-client \
    --host 127.0.0.1 \
    --user groundtruth \
    --password "$clickhouse_password" \
    --query "SELECT 1"
}

configure_application() {
  local encoded_postgres_password
  encoded_postgres_password="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$postgres_password")"

  # Keep the internal API off Render's public port scanner. Nginx owns port 10000.
  export GROUNDTRUTH_HOST=127.0.0.1
  export GROUNDTRUTH_PORT=3000
  export GROUNDTRUTH_PUBLIC_URL="${GROUNDTRUTH_PUBLIC_URL:-https://api.clear.seufert.sh}"
  export GROUNDTRUTH_CONSOLE_ORIGIN="${GROUNDTRUTH_CONSOLE_ORIGIN:-https://clear.seufert.sh}"
  export GROUNDTRUTH_POSTGRES_URL="postgresql://groundtruth:${encoded_postgres_password}@127.0.0.1:5432/groundtruth"
  export GROUNDTRUTH_POSTGRES_MAX_CONNECTIONS="${GROUNDTRUTH_POSTGRES_MAX_CONNECTIONS:-8}"
  export GROUNDTRUTH_CLICKHOUSE_URL=http://127.0.0.1:8123
  export GROUNDTRUTH_CLICKHOUSE_DATABASE=groundtruth
  export GROUNDTRUTH_CLICKHOUSE_USER=groundtruth
  export GROUNDTRUTH_CLICKHOUSE_PASSWORD="$clickhouse_password"
  export GROUNDTRUTH_BOOTSTRAP_PROJECT_SLUG="${GROUNDTRUTH_BOOTSTRAP_PROJECT_SLUG:-clear-demo}"
  export GROUNDTRUTH_BOOTSTRAP_PROJECT_NAME="${GROUNDTRUTH_BOOTSTRAP_PROJECT_NAME:-Clear demo}"
  export GROUNDTRUTH_BOOTSTRAP_INGEST_KEY="$demo_ingest_key"
  export GROUNDTRUTH_INGEST_KEY="$demo_ingest_key"
  export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
  export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
}

start_application_services() {
  # Bind Render's public port before any internal TCP listener. Render selects
  # the first detected port for health checks and public traffic.
  nginx -g 'daemon off;' &
  service_pids+=("$!")

  sh infra/scripts/run-migrations.sh

  su-exec clear:clear node apps/backend/dist/index.mjs &
  service_pids+=("$!")
  wait_for_command "Clear API" curl --fail --silent http://127.0.0.1:3000/health

  su-exec clear:clear clear-collector --config=/etc/groundtruth/collector.yaml &
  service_pids+=("$!")
  wait_for_command "OpenTelemetry Collector" curl --fail --silent http://127.0.0.1:13133/healthz

  PORT=4102 \
    OTEL_SERVICE_NAME=payments-stub \
    CONTROL_TOKEN="$PAYMENTS_CONTROL_TOKEN" \
    su-exec clear:clear node apps/payments-stub/dist/main.mjs &
  service_pids+=("$!")
  wait_for_command "Payments service" curl --fail --silent http://127.0.0.1:4102/readyz

  PORT=4103 \
    OTEL_SERVICE_NAME=load-generator \
    CHECKOUT_BASE_URL="${CHECKOUT_BASE_URL:-https://checkout-api.clear.seufert.sh}" \
    PAYMENTS_BASE_URL=http://127.0.0.1:4102 \
    su-exec clear:clear node apps/load-generator/dist/main.mjs &
  service_pids+=("$!")
  wait_for_command "Load generator" curl --fail --silent http://127.0.0.1:4103/readyz

  wait_for_command "Clear ingress" curl --fail --silent --header 'Host: api.clear.seufert.sh' http://127.0.0.1:10000/health
}

keep_checkout_warm() {
  local checkout_url="${CHECKOUT_KEEPALIVE_URL:-https://checkout-api.clear.seufert.sh/readyz}"
  while true; do
    sleep 600
    curl --fail --silent --max-time 15 "$checkout_url" >/dev/null || true
  done
}

start_postgres
start_clickhouse
configure_application
start_application_services
keep_checkout_warm &
service_pids+=("$!")

set +e
wait -n "${service_pids[@]}"
status="$?"
set -e
echo "A Clear runtime process exited with status $status" >&2
exit "$status"
