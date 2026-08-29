# ClickHouse storage

Clear stores full-fidelity OpenTelemetry metric points, logs, spans, span events, links, and exemplars in project-scoped MergeTree tables. Ten-second materialized rollups accelerate common dashboards without replacing raw signal semantics.

The SQL files in `migrations/` are intentional infrastructure SQL. ClickHouse does not have a Drizzle-style typed schema builder, and DDL for MergeTree ordering, TTLs, skipping indexes, and materialized aggregate states must be expressed in ClickHouse SQL. Application query parameters remain bound through `@clickhouse/client`.

Migrations are ordered, checksummed, and applied by `@groundtruth/persistence`. Do not treat `/docker-entrypoint-initdb.d` as the production migration mechanism.

Backups use the configured local disk:

```sql
BACKUP DATABASE groundtruth
TO Disk('backups', 'groundtruth-YYYYMMDDTHHMMSSZ.zip')
SETTINGS compression_method = 'zstd', compression_level = 3;
```

Copy completed archives from `/var/lib/clickhouse/backups` to off-host storage. A backup is not considered usable until its restore has been tested against a separate ClickHouse instance.
