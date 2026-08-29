# Local development stack

Clear includes a single-machine Docker Compose topology for contributors and integration tests. It is not a supported self-hosted product for the hackathon release.

The code is MIT licensed and can be adapted, but the maintainers are not promising production hardening, upgrades, backups, high availability, or support for independent installations yet.

## Requirements

- Node.js 24 or newer
- Vite+ 0.3.x
- Docker Engine with Compose v2
- at least 4 GB available to Docker

## Start the stack

Install and validate the workspace:

```sh
vp install
vp run ready
```

Copy the development configuration:

```sh
cp .env.example .env
cp apps/console/.env.example apps/console/.env.local
```

The checked-in values are safe defaults for an isolated local machine only. Replace every secret before exposing any service to another host.

Start the console:

```sh
vp run dev
```

In a separate terminal, start the stateful services and example stack:

```sh
docker compose -f infra/compose.yaml up --build
```

## Local endpoints

| Service          | Endpoint                         |
| ---------------- | -------------------------------- |
| Console          | `http://localhost:5173`          |
| API              | `http://localhost:3000`          |
| OTLP/HTTP        | `http://localhost:4318`          |
| OTLP/gRPC        | `localhost:4317`                 |
| Collector health | `http://localhost:13133/healthz` |
| Checkout API     | `http://localhost:4101`          |
| Payments stub    | `http://localhost:4102`          |
| Load generator   | `http://localhost:4103`          |

Every published host port binds to `127.0.0.1` by default.

## Local authentication

The local console opens an anonymous sandbox automatically when you enter the workspace. Clear does not expose a self-hosted browser-login endpoint in its public API. Internal service credentials in `.env` exist only for local process-to-process authentication and must never be stored in browser storage or committed.

## Send telemetry

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_HEADERS=x-clear-ingest-key=local-demo-ingest-key
export OTEL_SERVICE_NAME=my-service
```

The local Collector accepts metrics, logs, and traces over OTLP/HTTP protobuf, OTLP/HTTP JSON, and OTLP/gRPC. The hosted hackathon endpoint accepts OTLP/HTTP only.

## Persistence and cleanup

PostgreSQL and ClickHouse use named Docker volumes. A normal stop preserves both:

```sh
docker compose -f infra/compose.yaml down
```

Do not add `--volumes` unless you intend to delete all local state and telemetry.

The local backup script exists for development and migration rehearsal:

```sh
sh infra/scripts/backup-local.sh
```

It is not a production backup system. The hosted hackathon deployment has no off-host backup commitment.

## Forking the Sites frontends

`apps/console/.openai/hosting.json` and `apps/checkout-web/.openai/hosting.json` identify the maintainers' Sites projects. Those project IDs are not credentials, but a fork must not deploy against them.

Create new Sites projects and replace the corresponding `project_id` values before publishing a fork. Keep hosted secrets in Sites and Render, local values in uncommitted `.env` files, and never add credentials to hosting metadata.
