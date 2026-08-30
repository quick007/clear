# Persistence

Clear's durable storage boundary. PostgreSQL holds product and authentication
state, while ClickHouse holds metrics, logs, traces, and their query rollups.
The package exposes both stores through typed Effect services and layers.

## What lives here

- Drizzle schemas, relations, repositories, and migrations for accounts,
  sessions, projects, ingest keys, dashboards, alerts, incidents, deploy events,
  and the outbox.
- ClickHouse ingestion and project-scoped queries for telemetry catalogs,
  service activity, metrics, logs, and traces.
- Project bootstrap, retention policy, quota policy, and coordinated project
  deletion across both stores.
- In-memory repository layers and Testcontainers layers for backend tests.

## Import surfaces

- `@groundtruth/persistence` exports repository services and contracts, live
  layers, typed errors, migration effects, policies, and persistence records.
- `@groundtruth/persistence/schema` exports the Drizzle schema and relations.
- `@groundtruth/persistence/testing` exports in-memory implementations,
  controls, and migrated PostgreSQL and ClickHouse test layers.

The backend normally provides `PersistenceLive`, which assembles the configured
database clients, repository implementations, bootstrap service, and project
purger.

## Configuration

The live layer reads these environment variables:

| Variable                               | Purpose                   | Default or fallback                                             |
| -------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| `GROUNDTRUTH_POSTGRES_URL`             | PostgreSQL connection URL | `DATABASE_URL`, then the local Clear URL                        |
| `GROUNDTRUTH_POSTGRES_MAX_CONNECTIONS` | PostgreSQL pool size      | `10`                                                            |
| `GROUNDTRUTH_CLICKHOUSE_URL`           | ClickHouse HTTP URL       | `GROUNDTRUTH_CLICKHOUSE_HOSTPORT`, then `http://localhost:8123` |
| `GROUNDTRUTH_CLICKHOUSE_DATABASE`      | ClickHouse database       | `groundtruth`                                                   |
| `GROUNDTRUTH_CLICKHOUSE_USER`          | ClickHouse user           | `groundtruth`                                                   |
| `GROUNDTRUTH_CLICKHOUSE_PASSWORD`      | ClickHouse password       | `groundtruth`                                                   |

`GROUNDTRUTH_BOOTSTRAP_PROJECT_SLUG`, `GROUNDTRUTH_BOOTSTRAP_PROJECT_NAME`, and
`GROUNDTRUTH_BOOTSTRAP_INGEST_KEY` are optional, but must be set together. The
bootstrap ingest key must contain at least 16 characters.

## Migrations

PostgreSQL migrations are generated into [`drizzle/`](drizzle). ClickHouse SQL
migrations live in [`../../infra/clickhouse/migrations/`](../../infra/clickhouse/migrations).

```sh
vp -C packages/persistence run db:generate
vp -C packages/persistence run db:migrate
vp -C packages/persistence run clickhouse:migrate
```

Review generated migration files before committing them. Both migration runners
are designed to be safe to run repeatedly, and ClickHouse also verifies the
checksum of every previously applied migration.

## Validate

```sh
vp -C packages/persistence run check
vp -C packages/persistence run test
vp -C packages/persistence run build
```

Database integration tests are opt-in and use pinned PostgreSQL and ClickHouse
containers. With a Docker-compatible runtime available, run:

```sh
GROUNDTRUTH_RUN_DATABASE_TESTS=true vp -C packages/persistence run test
```
