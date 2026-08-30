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

## Key files

- [`src/index.ts`](src/index.ts): runtime layers, maintenance fibers, and HTTP server.
- [`src/http/HttpRoutes.ts`](src/http/HttpRoutes.ts): public and internal route composition.
- [`src/telemetry/`](src/telemetry): Collector ingest, normalization, storage, and querying.
- [`src/incidents/`](src/incidents): incident state and durable services.
- [`test/`](test): service, handler, persistence, and integration coverage.

## Validate

```sh
vp -C apps/backend run test
vp -C apps/backend run build
```
