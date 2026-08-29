#!/bin/sh

set -eu
umask 077

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_directory=$(dirname "$(dirname "$script_directory")")
compose_file="$repository_directory/infra/compose.yaml"
backup_root="${1:-$repository_directory/backups}"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_directory="$backup_root/$timestamp"
clickhouse_archive="groundtruth-$timestamp.zip"

mkdir -p "$backup_directory"

docker compose -f "$compose_file" exec -T postgres \
  pg_dump --username groundtruth --dbname groundtruth --format custom \
  > "$backup_directory/postgres.dump"

docker compose -f "$compose_file" exec -T \
  -e GROUNDTRUTH_BACKUP_NAME="$clickhouse_archive" clickhouse sh -eu -c '
    clickhouse-client \
      --user "$CLICKHOUSE_USER" \
      --password "$CLICKHOUSE_PASSWORD" \
      --query "BACKUP DATABASE groundtruth TO Disk('\''backups'\'', '\''${GROUNDTRUTH_BACKUP_NAME}'\'') SETTINGS compression_method='\''zstd'\'', compression_level=3"
  '

docker compose -f "$compose_file" cp \
  "clickhouse:/var/lib/clickhouse/backups/$clickhouse_archive" \
  "$backup_directory/clickhouse.zip"
chmod 600 "$backup_directory/clickhouse.zip"

(
  cd "$backup_directory"
  openssl dgst -sha256 postgres.dump clickhouse.zip > SHA256SUMS
)

echo "Backup written to $backup_directory"
