<p align="center">
  <img src="media/devpost/outputs/clear-devpost-hero.png" alt="Clear: Let your agent see production" width="100%" />
</p>

# Clear

[![CI](https://github.com/quick007/clear/actions/workflows/ci.yml/badge.svg)](https://github.com/quick007/clear/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-f4b968.svg)](LICENSE)

Clear is an OpenTelemetry workspace shared by you and the coding agent that already knows your code.

Most observability products put a vendor copilot beside the dashboard. Clear exposes metrics, logs, traces, alerts, panels, and incident context as typed WebMCP tools instead. Your agent can investigate production evidence and build durable views while you follow the same board. Connect it by pointing any OTLP/HTTP exporter at Clear.

Clear does not check out your repository, store deploy credentials, or execute a fix. Your agent handles code changes and deploys using the access it already has.

## Try it

| Surface       | URL                                                            |
| ------------- | -------------------------------------------------------------- |
| Live app      | [clear.seufert.sh](https://clear.seufert.sh)                   |
| Public status | [clear.seufert.sh/status](https://clear.seufert.sh/status)     |
| API reference | [api.clear.seufert.sh/docs](https://api.clear.seufert.sh/docs) |
| Source        | [github.com/quick007/clear](https://github.com/quick007/clear) |

### Try the demo

1. Open Clear in ChatGPT's in-app browser with site tools available, or in Chrome with WebMCP enabled.
2. Select **Investigate an incident**.
3. Copy the suggested prompt from the board into your agent conversation.
4. Keep the board visible while your agent investigates and adds panels.

## WebMCP

Clear gives you and your coding agent access to the same dashboard and telemetry.

- You and your agent work from the same telemetry.
- Site tools let your agent query metrics, logs, traces, alerts, and deploys.
- Incident tools become available when an incident is open.
- Panels created by your agent are saved to the board.
- Code changes and deploys still happen through your agent's existing environment.

## Architecture

```text
OpenTelemetry SDKs and Collectors
              |
              | OTLP/HTTP protobuf or JSON
              v
        Clear Collector (Go)
              |
              | authenticated, project-scoped batches
              v
        Effect API (TypeScript)
          /               \
         v                 v
  PostgreSQL            ClickHouse
  product state         telemetry
         \                 /
          v               v
       React console and WebMCP site tools
```

The Go data plane uses official OpenTelemetry Collector components for OTLP parsing, compression, batching, memory limits, and transport. The TypeScript control plane uses Effect v4 contracts, schemas, layers, and services. PostgreSQL owns accounts, projects, boards, incidents, keys, and deploy events. ClickHouse owns telemetry and rollups.

The hosted version runs the stateful Clear services together on one Render instance with a persistent disk. The console is published with ChatGPT Sites.

Clear also monitors its own hosted services. The [public status page](https://clear.seufert.sh/status) shows their health, request rate, and latency using telemetry collected by Clear.

Read [the architecture guide](docs/architecture.md) for the detailed component and trust boundaries.

## Connect OpenTelemetry

Clear uses standard OTLP. There is no proprietary Clear SDK to install.

The maintained [Node example](examples/node-otel/USAGE.md) uses the official OpenTelemetry packages and emits a metric, structured log, and trace. Existing OpenTelemetry Collectors can forward all three signals without application changes.

Local OTLP/HTTP configuration:

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_HEADERS=x-clear-ingest-key=local-demo-ingest-key
export OTEL_SERVICE_NAME=my-service
```

Clear accepts the three stable signals at their standard paths:

- `POST /v1/metrics`
- `POST /v1/logs`
- `POST /v1/traces`

The hosted service supports OTLP/HTTP protobuf and JSON at `https://otlp.clear.seufert.sh`. The local development stack also supports OTLP/gRPC.

See the [OpenTelemetry quickstart](docs/otel-quickstart.md) for application and upstream Collector setup.

## Run locally

The local Compose stack is intended for development, not as a supported self-hosted release.

Requirements:

- Node.js 24 or newer
- [Vite+](https://viteplus.dev/) 0.3.x
- Docker Engine with Compose v2
- At least 4 GB available to Docker

Create local configuration:

```sh
cp .env.example .env
cp apps/console/.env.example apps/console/.env.local
cp apps/checkout-web/.env.example apps/checkout-web/.env.local
```

Install and validate the TypeScript workspace:

```sh
vp install
vp run ready
```

Start the console:

```sh
vp run dev
```

In a separate terminal, start the stateful stack and example services:

```sh
docker compose -f infra/compose.yaml up --build
```

| Service           | Local endpoint                                    |
| ----------------- | ------------------------------------------------- |
| Console           | `http://localhost:5173`                           |
| API and reference | `http://localhost:3000`, `/docs`, `/openapi.json` |
| OTLP/HTTP         | `http://localhost:4318`                           |
| OTLP/gRPC         | `localhost:4317`                                  |
| Collector health  | `http://localhost:13133/healthz`                  |
| Checkout API      | `http://localhost:4101`                           |

The console starts in demo mode. The checked-in development secrets are only for local use. Replace every secret before exposing the stack to a shared machine or network.

## Example incident stack

Three instrumented services create the retry-amplification incident:

- `checkout-api`, with an intentionally naive retry loop
- `payments-stub`, a deterministic dependency that degrades under load
- `load-generator`, which produces a repeatable incident

The scenario first resembles a traffic surge. Upstream requests rise while incoming checkouts and unique users remain flat. Grouping by retry state reveals the amplification, then a representative trace and its correlated logs show the immediate retry loop.

## Repository map

```text
apps/
  backend/          Effect HTTP API and application services
  collector/        Custom OpenTelemetry Collector distribution in Go
  console/          React, TanStack, StyleX, Base UI, and WebMCP surface
  checkout-api/     Intentionally broken, instrumented example service
  checkout-web/     Customer-facing storefront for the example incident
  payments-stub/    Deterministic failing dependency
packages/
  api-contract/     Typed Effect HTTP API contract and client
  domain/           Domain models, IDs, and errors
  panel-dsl/        Agent-authored panel specification
  persistence/      Drizzle PostgreSQL and ClickHouse repositories
  telemetry/        Telemetry query and ingest models
  telemetry-gen/    Deterministic sandbox telemetry
examples/
  load-generator/   Repeatable incident controller
  node-otel/        Runnable official OpenTelemetry Node example
infra/              Compose, Render deployment, migrations, and runbooks
docs/               Architecture, integration, operation, and design notes
```

## Hosted release boundaries

- One durable project per account and up to three active ingest keys.
- Raw metrics, logs, and traces are retained for 24 hours. Metric rollups are retained for 7 days.
- Hosted ingest supports OTLP/HTTP protobuf and JSON.
- The hosted service is single-instance and does not provide high availability.
- The local Compose topology is for development and testing. Self-hosted operation is not supported for this release.
- The project has not completed an independent security audit or production load test.

## Documentation

- [Architecture](docs/architecture.md)
- [OpenTelemetry quickstart](docs/otel-quickstart.md)
- [Self-observability and public status](docs/self-observability.md)
- [Connecting a real project](docs/real-mode.md)
- [Local development stack](docs/self-hosting.md)
- [Infrastructure notes](infra/README.md)
- [Collector details](apps/collector/README.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [OpenAPI](https://api.clear.seufert.sh/openapi.json)

## License

Clear is available under the [MIT License](LICENSE).
