# Backend

Clear's Effect control plane and query API. It owns authentication, projects,
boards, alerts, incidents, deploy events, sandbox sessions, and telemetry query
orchestration. PostgreSQL stores product state and ClickHouse stores telemetry.

In the hosted deployment this process runs inside the stateful Render runtime
behind its shared ingress. It is also runnable as a standalone process for local
development.

## Local development

Start PostgreSQL and ClickHouse with the repository stack described in
[`docs/self-hosting.md`](../../docs/self-hosting.md), then run:

```sh
vp -C apps/backend run dev
```

The API listens on `http://localhost:3000` by default.

## Configuration

Application configuration is defined in
[`src/config/BackendConfig.ts`](src/config/BackendConfig.ts). Database
configuration is defined in
[`packages/persistence/src/config.ts`](../../packages/persistence/src/config.ts).
Use uncommitted environment files for local secrets and hosting-provider
environment variables for deployed secrets.

`GROUNDTRUTH_PUBLIC_STATUS_ENABLED` defaults to `false`. Set it to `true` only
when this deployment should publish the bounded bootstrap-project projection at
`GET /v1/public/status`. This switch does not make other projects or query
endpoints public.

## Self-observability

The backend exports its own request metrics, process gauges, and server traces
through standard OTLP/HTTP. In the hosted runtime they enter the co-located
Collector with the bootstrap project's ingest key, so Clear can display the
same application evidence it accepts from other services.

Internal Collector-to-backend telemetry routes are excluded from request
instrumentation, tracing, and response logs to prevent recursive export. Auth,
session, and ingest headers are included in the runtime redaction set. Backend
log export is not enabled by this integration.

See [`docs/self-observability.md`](../../docs/self-observability.md) for the
public projection and privacy boundary.

## Key files

- [`src/index.ts`](src/index.ts): runtime layers, maintenance fibers, and HTTP server.
- [`src/http/HttpRoutes.ts`](src/http/HttpRoutes.ts): public and internal route composition.
- [`src/http/PublicStatusHandlers.ts`](src/http/PublicStatusHandlers.ts): bounded public health projection.
- [`src/telemetry/`](src/telemetry): self-instrumentation, Collector ingest, normalization, storage, and querying.
- [`src/incidents/`](src/incidents): incident state and durable services.
- [`test/`](test): service, handler, persistence, and integration coverage.

## Validate

```sh
vp -C apps/backend run test
vp -C apps/backend run build
```
