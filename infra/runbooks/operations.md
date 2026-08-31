# Operations runbook

## Health model

| Component      | Check                                   | Healthy means                                        |
| -------------- | --------------------------------------- | ---------------------------------------------------- |
| API            | `GET /health`                           | Process is serving and required stores are reachable |
| Collector      | `GET :13133/healthz` inside the runtime | Receiver pipelines and extensions started            |
| Checkout API   | `GET /readyz`                           | Server and payments dependency are usable            |
| Payments stub  | `GET /readyz`                           | Server can accept authorization calls                |
| Load generator | `GET /readyz`                           | Controller can reach its scenario dependencies       |
| PostgreSQL     | `pg_isready`                            | Server accepts the product database connection       |
| ClickHouse     | `/ping` or `SELECT 1`                   | Server accepts the configured user connection        |

Liveness must not claim the system is healthy when required storage is unavailable. Readiness may remain degraded while product state can still be served, but ingest must return an explicit retryable failure rather than silently dropping telemetry.

## ClickHouse disk watermarks

Inspect the persistent disk with:

```sql
SELECT
    name,
    path,
    formatReadableSize(total_space) AS total,
    formatReadableSize(free_space) AS free,
    round(100 * (total_space - free_space) / total_space, 1) AS used_percent
FROM system.disks;
```

Initial actions:

- 70 percent used: review retention, unexpected cardinality, and backup growth.
- 85 percent used: confirm TTL cleanup, remove stale local backup artifacts, or increase the Render disk before the next recording.
- 95 percent used: pause ingest and preserve query access. Do not wait for merges to exhaust the disk.

Render disks can grow but cannot shrink. TTL cleanup and merges need working space, so the response threshold must stay below full capacity. Deleting arbitrary parts is not the first response.

## ClickHouse unavailable

Expected behavior:

1. API health becomes degraded.
2. Ingest returns a retryable status with bounded guidance.
3. The Collector uses its bounded queue and retry policy, then applies backpressure. It never grows memory without a limit.
4. PostgreSQL product state remains available where safe, but telemetry views clearly show that data is delayed.
5. Collector activity hints remain disposable and do not claim that data was committed.

Check disk capacity, process memory, recent merges, failed migrations, and credentials. Restart only after identifying whether the failure is resource exhaustion or configuration. If the hosted disk is corrupt, stop ingest and rebuild. The hackathon deployment has no off-host recovery promise.

## Intermittent telemetry query failures

The hosted ClickHouse profile runs queries on one thread and accepts up to eight concurrent queries. Each application ClickHouse client is bounded to four open connections, so a normal dashboard burst waits in the client instead of crossing the server limit.

If telemetry reads still alternate between success and retryable `503` responses, inspect the backend's correlated storage error before changing limits. ClickHouse error `202` indicates query concurrency saturation, while `241` indicates memory pressure. Raising either limit without checking the client pools and the 2 GB service memory budget can turn a short overload into a process restart.

## PostgreSQL unavailable

The API cannot authenticate projects or reliably write product state, so it should fail readiness and reject ingest rather than bypass project-key validation. Inspect the PostgreSQL child process, disk capacity, credentials, and connection limits. Do not point the hosted service at an in-memory fallback.

## Collector unavailable

Existing data and product state remain queryable through the API. New clients receive connection failures at the OTLP endpoint. Check the Render service logs, internal API connectivity, service-token agreement, and receiver limits. A Collector restart is safe because durable state lives behind the API and databases, but clients must still use standard retry behavior.

## Migration failure

The migration runner applies PostgreSQL first and ClickHouse second. Each migration must be idempotent under its version ledger. If a retry still fails:

1. Leave the newer API undeployed.
2. Capture the exact migration and database error.
3. Inspect both migration ledgers before rerunning anything manually.
4. Write a forward repair when a migration partially changed data.
5. Re-run the committed migration command, not a copied SQL fragment from chat history.

## Safe shutdown and restart

For planned maintenance, stop scenario traffic first, then Collector ingress, API, ClickHouse, and PostgreSQL. Start in the reverse dependency order: storage, migrations, API, Collector, examples. Compose encodes this startup order with health and completion conditions.

Do not remove persistent volumes during routine restart. A Render persistent-disk snapshot is not a coordinated PostgreSQL and ClickHouse backup.
