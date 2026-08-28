# Backup and restore runbook

Groundtruth spans PostgreSQL and ClickHouse. A backup of only one store is incomplete:

- PostgreSQL owns users, projects, keys, boards, incidents, timelines, deploy events, and the durable event outbox.
- ClickHouse owns metrics, logs, traces, correlations, and rollups.

## Local backup

With the Compose stack healthy, run:

```sh
sh infra/scripts/backup-local.sh
```

The script creates a timestamped directory under `backups/` containing:

- `postgres.dump`, a PostgreSQL custom-format dump
- `clickhouse.zip`, a native ClickHouse database backup compressed with Zstandard
- `SHA256SUMS`, checksums for both artifacts

Pass a different destination directory as the first argument when the backup must live outside the repository.

The ClickHouse archive is first created on the configured `backups` disk and then copied to the host. Periodically remove old server-side archives after the off-host copy and checksum have been verified, or they will consume the telemetry disk.

## Hosted backup

Render's automatic persistent-disk snapshots are not a database-consistent recovery mechanism for a custom database. Render explicitly recommends logical database backups instead of restoring a disk snapshot for this case.

For a coordinated hosted backup:

1. Stop the load generator and pause public Collector traffic.
2. Wait for in-flight ingest requests and migrations to finish.
3. Create or verify the managed PostgreSQL backup for the selected plan. Also take a `pg_dump --format=custom` before a risky schema release.
4. Open a shell on the ClickHouse private service and run:

```sql
BACKUP DATABASE groundtruth
TO Disk('backups', 'groundtruth-YYYYMMDDTHHMMSSZ.zip')
SETTINGS compression_method = 'zstd', compression_level = 3;
```

5. Copy the ClickHouse archive off the Render disk with SFTP or SCP using the exact SSH command Render supplies.
6. Record the PostgreSQL backup identifier, ClickHouse archive checksum, application revision, and migration versions together.
7. Resume Collector traffic and the load generator.

A file that exists only on the ClickHouse persistent disk is not a backup. Store it in a separate provider or a separately controlled machine.

## Restore drill

Never test a restore over the active databases.

1. Provision fresh isolated PostgreSQL and ClickHouse instances using the same major versions and ClickHouse configuration.
2. Restore `postgres.dump` with `pg_restore` into the empty PostgreSQL database.
3. Upload the ClickHouse archive to the fresh instance's `/var/lib/clickhouse/backups/` directory.
4. Restore under a temporary database name first:

```sql
RESTORE DATABASE groundtruth AS groundtruth_restore
FROM Disk('backups', 'groundtruth-YYYYMMDDTHHMMSSZ.zip');
```

5. Check migration-version tables, per-project row counts, a sample trace tree, trace-to-log correlation, metric rollups, and the newest timestamps.
6. Start an isolated API against the restored stores and run storage integration tests.
7. Record the measured restore time and any manual corrections.
8. Destroy the isolated restore only after the drill result has been captured.

If a real recovery needs the restored data, keep ingest stopped, validate project boundaries, then switch both PostgreSQL and ClickHouse connections in one planned cutover. Do not combine a restored PostgreSQL snapshot with an unrelated ClickHouse point in time without documenting the expected mismatch.

## Initial policy

Until traffic volume gives better evidence:

- Take a logical backup before schema changes and before recording the submission video.
- Take ClickHouse logical backups daily while hosted data matters.
- Restore-test at least once before submission and after any backup configuration change.
- Monitor backup duration and archive size so a full telemetry disk does not prevent the next backup.

The final off-host destination and explicit recovery-point and recovery-time targets remain product-owner decisions.
