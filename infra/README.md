# Groundtruth infrastructure

This directory runs the stateful Groundtruth services without pretending that ChatGPT Sites is a container host. The console and checkout storefront are separate Sites deployments. Render runs the Effect API, public OTLP/HTTP ingress, PostgreSQL, private ClickHouse, and the example services.

## Topology

| Component | Local address | Hosted address | Exposure |
| --- | --- | --- | --- |
| Console | `http://localhost:5173` | `https://groundtruth.seufert.sh` | Sites |
| Checkout storefront | Local Vite dev server | `https://checkout.groundtruth.seufert.sh` | Sites |
| Effect API | `http://localhost:3000` | `https://api.groundtruth.seufert.sh` | Public |
| OTLP/HTTP | `http://localhost:4318` | `https://otlp.groundtruth.seufert.sh` | Public |
| OTLP/gRPC | `localhost:4317` | Not in hosted v1 | Local and self-hosted |
| Collector health | `http://localhost:13133` | Private platform check | Local only |
| Checkout API | `http://localhost:4101` | `https://checkout-api.groundtruth.seufert.sh` | Public |
| Payments stub | `http://localhost:4102` | Render private network | Local or private |
| Load controller | `http://localhost:4103` | Render private network | Local or private |
| PostgreSQL | `localhost:5432` | Render managed Postgres | Local or private |
| ClickHouse HTTP | `http://localhost:8123` | Render private network | Local or private |

Render exposes one public port per service. Hosted v1 therefore publishes the Collector's OTLP/HTTP receiver and documents gRPC for local and self-hosted installs. It does not add a custom protocol proxy merely to force both transports through one Render service.

## Run locally

Requirements:

- Docker Engine with Compose v2
- At least 4 GB of memory available to Docker
- Vite+ for running the console outside Compose

Copy the local configuration and replace the example secrets if the machine is shared:

```sh
cp .env.example .env
docker compose -f infra/compose.yaml up --build
```

Compose starts storage first, runs committed PostgreSQL and ClickHouse migrations, then starts the API, Collector, and example services. The API idempotently creates a local project whose ingest key is `GROUNDTRUTH_DEMO_INGEST_KEY`. Production never enables this bootstrap path.

Run the console separately with Vite+:

```sh
vp dev
```

Quick checks:

```sh
curl --fail http://localhost:3000/health
curl --fail http://localhost:13133/healthz
curl --fail http://localhost:4101/readyz
curl --fail http://localhost:4102/readyz
curl --fail http://localhost:4103/readyz
```

All host-published local ports bind to `127.0.0.1`. Containers use the private `app` and `data` networks. PostgreSQL and ClickHouse are not reachable from the application network except through the backend.

`docker compose down` preserves the named database volumes. Removing the volumes deletes local product state and telemetry, so volume removal is intentionally not part of the normal workflow.

## Images and limits

- TypeScript services build with the pinned Vite+ `0.3.0` image and run on Node `24.8.0` as a non-root user.
- ClickHouse is pinned to `25.8.33.6-alpine`, the 25.8 LTS line.
- Local ClickHouse is capped at 2 GB. The Render Blueprint uses the 2 GB Standard service because 512 MB is not a credible always-on target for merges across metrics, logs, and traces.
- Render previews and autoscaling are disabled. The architecture intentionally has one instance of each service.
- Node services use read-only root filesystems and bounded Docker logs locally.

The current Render Blueprint is paid infrastructure. Review its plans before importing it. Do not silently downgrade ClickHouse to a 512 MB Starter instance to reduce the displayed estimate.

## Files

- `compose.yaml`: complete local and self-hosted stack
- `render.yaml`: Render Blueprint for hosted stateful services
- `docker/`: reproducible Node and ClickHouse images
- `scripts/run-migrations.sh`: ordered, retry-bounded migrations
- `scripts/backup-local.sh`: PostgreSQL plus ClickHouse logical backup
- `runbooks/deploy.md`: deployment and migration order
- `runbooks/backups.md`: backup and restore drills
- `runbooks/operations.md`: health, disk, and failure response
- `domains.md`: custom-domain and DNS ownership
