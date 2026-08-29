# Backup policy

Clear spans PostgreSQL and ClickHouse. PostgreSQL owns product state, while ClickHouse owns metrics, logs, traces, correlations, and rollups. A copy of only one store is not a coherent backup.

## Hackathon deployment

The hosted hackathon service has no off-host backup commitment. Its Render disk is persistent across normal deploys, but a disk snapshot is not a coordinated database backup and must not be described as one.

The hosted service is a public preview with 24-hour raw telemetry retention and 7-day metric rollups. Do not place irreplaceable production telemetry in it. If the persistent disk is lost or corrupted, rebuild the service and treat the hosted telemetry as lost.

This is an explicit scope decision, not a missing configuration. A future production release needs coordinated logical backups, restore drills, recovery objectives, encrypted off-host storage, and schema-compatible recovery procedures before making durability claims.

## Local backup helper

With the Compose stack healthy, run:

```sh
sh infra/scripts/backup-local.sh
```

The script creates a timestamped directory under `backups/` containing:

- `postgres.dump`, a PostgreSQL custom-format dump
- `clickhouse.zip`, a native ClickHouse database backup compressed with Zstandard
- `SHA256SUMS`, checksums for both artifacts

Pass a different destination directory as the first argument when the files should live outside the repository. This helper exists for migration rehearsal and contributor debugging. It is not the hosted product's backup system.

## Local restore rehearsal

Never test a restore over active databases.

1. Start fresh isolated PostgreSQL and ClickHouse instances using the same major versions and ClickHouse configuration.
2. Restore `postgres.dump` with `pg_restore` into the empty PostgreSQL database.
3. Upload `clickhouse.zip` to the fresh instance's configured `backups` disk.
4. Restore under a temporary database name first.
5. Check migration ledgers, per-project row counts, a sample trace tree, trace-to-log correlation, metric rollups, and newest timestamps.
6. Start an isolated API against the restored stores and run storage integration tests.

Do not combine a PostgreSQL snapshot with an unrelated ClickHouse point in time without documenting the expected mismatch.
