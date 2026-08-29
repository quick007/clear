# Clear infrastructure

The hosted hackathon topology is deliberately small. ChatGPT Sites publishes the console and checkout storefront. Render runs one stateful Clear service plus a separate checkout API so the video can show a clean real checkout deployment.

## Topology

| Component           | Local address           | Hosted address                          | Runtime                 |
| ------------------- | ----------------------- | --------------------------------------- | ----------------------- |
| Console             | `http://localhost:5173` | `https://clear.seufert.sh`              | ChatGPT Sites           |
| Checkout storefront | `http://localhost:5174` | `https://checkout.clear.seufert.sh`     | ChatGPT Sites           |
| Effect API          | `http://localhost:3000` | `https://api.clear.seufert.sh`          | stateful Render service |
| OTLP/HTTP           | `http://localhost:4318` | `https://otlp.clear.seufert.sh`         | stateful Render service |
| OTLP/gRPC           | `localhost:4317`        | not hosted                              | local development only  |
| Checkout API        | `http://localhost:4101` | `https://checkout-api.clear.seufert.sh` | separate Render service |
| Payments stub       | `http://localhost:4102` | internal route only                     | stateful Render service |
| Load controller     | `http://localhost:4103` | internal route only                     | stateful Render service |
| PostgreSQL          | `localhost:5432`        | internal listener on persistent disk    | stateful Render service |
| ClickHouse HTTP     | `http://localhost:8123` | internal listener on persistent disk    | stateful Render service |

The stateful Render service uses the `1c-2g` plan and one 10 GB disk. Nginx receives Render's public port and routes by hostname to the API or Collector. PostgreSQL, ClickHouse, the payments stub, and the scenario controller are not exposed as standalone public services.

The checkout API remains separate so a commit limited to `apps/checkout-api` deploys only that service. The main service keeps the free checkout service warm during the recorded scenario.

## Hosted limits

- one instance, no horizontal scaling or high-availability claim
- 24 hours of raw metrics, logs, and traces
- 7 days of ten-second metric rollups
- OTLP/HTTP protobuf and JSON for all three stable signals
- no public OTLP/gRPC endpoint
- no off-host backup commitment for the hackathon

## Run locally

Requirements:

- Docker Engine with Compose v2
- at least 4 GB of memory available to Docker
- Vite+ for the console outside Compose

```sh
cp .env.example .env
docker compose -f infra/compose.yaml up --build
```

Compose starts storage first, runs committed PostgreSQL and ClickHouse migrations, then starts the API, Collector, and example services. The API creates a development project whose ingest key is `GROUNDTRUTH_DEMO_INGEST_KEY`. Production never enables this bootstrap path.

Run the console separately:

```sh
vp run dev
```

Quick checks:

```sh
curl --fail http://localhost:3000/health
curl --fail http://localhost:13133/healthz
curl --fail http://localhost:4101/readyz
curl --fail http://localhost:4102/readyz
curl --fail http://localhost:4103/readyz
```

All host-published local ports bind to `127.0.0.1`. `docker compose down` preserves database volumes. Removing volumes deletes local product state and telemetry.

The local admin-token route exists for development only. The Compose topology is not a supported self-hosted release.

## Images and limits

- TypeScript services build with pinned Vite+ and Node versions.
- The backend runtime image contains production bundles, migration entrypoints, and migration assets rather than monorepo source or development dependencies.
- ClickHouse is pinned to the 25.8 LTS line.
- The all-in-one hosted configuration gives PostgreSQL, ClickHouse, Node, Go Collector, and Nginx explicit memory and concurrency limits.
- Render previews and autoscaling are disabled.

The ClickHouse database name remains `groundtruth` because it is an internal storage contract. Public branding does not require a risky database or package namespace migration.

## Files

- `compose.yaml`: contributor-only local stack
- `render.yaml`: Render Blueprint for the hosted stateful service and checkout API
- `render/`: hosted process supervisor and Nginx routing
- `docker/`: reproducible images and runtime entrypoints
- `scripts/run-migrations.sh`: ordered, retry-bounded migrations
- `scripts/backup-local.sh`: local PostgreSQL plus ClickHouse backup helper
- `runbooks/deploy.md`: hosted deployment order
- `runbooks/backups.md`: local backup and hosted no-backup policy
- `runbooks/operations.md`: health, disk, and failure response
- `domains.md`: custom-domain and DNS ownership
