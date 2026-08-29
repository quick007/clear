# Clear

Clear is an open source OpenTelemetry observability surface built for people and their own agents. It accepts metrics, logs, and traces, gives operators a live incident board, and exposes the same investigation surface as typed WebMCP site tools.

Clear observes. It never fixes, deploys, merges, or changes infrastructure. Your agent keeps using the repository and production access you already gave it. Clear gives both of you a shared place to understand what is happening and see the result of a fix.

> **Project status:** active WebMCP Challenge development. The product, Collector, persistence layer, and real retry-storm example are implemented. The hosted deployment, final browser compatibility pass, security review, and production load test are still being completed.

## Links

- Live app: [clear.seufert.sh](https://clear.seufert.sh)
- Example checkout: [checkout.clear.seufert.sh](https://checkout.clear.seufert.sh)
- Submission video: publishing with the final submission
- Repository: [github.com/quick007/clear](https://github.com/quick007/clear)

## 30-second judging path

1. Open the live app in ChatGPT's in-app browser on an account with Site tools available.
2. Select **Demo incident**. No account or infrastructure connection is required.
3. Ask: `Investigate the active alerts and show me the strongest evidence.`
4. Keep the board visible while your agent queries telemetry, tests hypotheses, and composes the next useful panel.

The default visit is an isolated two-hour sandbox. It can be reset and repeated without affecting another visitor. The sandbox covers investigation and diagnosis. It does not fake a code change or deployment.

## What makes it different

Most observability products add a vendor-owned copilot beside a dashboard. Clear makes the observability surface itself agent-operable.

- Bring any OpenTelemetry-instrumented service.
- Bring your own agent and repository access.
- Investigate metrics, logs, traces, alerts, deploys, and incident context through one typed surface.
- Watch the same board while the agent queries data and composes useful views.
- Keep execution where it already belongs. Clear holds no repository or deployment credentials.

The repository contains a deterministic sandbox for self-serve investigation and a real instrumented checkout stack for the scripted submission video. In the video, the agent edits and pushes the checkout service through its own repository access. Render performs a real deploy, then Clear shows the deploy event and recovering telemetry.

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

The Go data plane uses official OpenTelemetry Collector components for OTLP parsing, compression, batching, memory limits, and transport. The TypeScript control plane uses Effect v4 contracts and services. PostgreSQL owns accounts, projects, boards, incidents, keys, and deploy events. ClickHouse owns metrics, logs, traces, correlations, and rollups.

The hosted hackathon deployment keeps the stateful Clear services together on one Render instance with a persistent disk. The checkout API is a separate Render service so the video can show an isolated real deployment. The console and checkout storefront are published with ChatGPT Sites.

Read [docs/architecture.md](docs/architecture.md) for trust boundaries and implementation details.

## Run locally

The Compose stack is a contributor environment, not a supported self-hosted release.

Requirements:

- Node.js 24 or newer
- [Vite+](https://viteplus.dev/) 0.3.x
- Docker Engine with Compose v2
- At least 4 GB available to Docker

Install and validate the TypeScript workspace:

```sh
vp install
vp run ready
```

Create local configuration for the stack and console:

```sh
cp .env.example .env
cp apps/console/.env.example apps/console/.env.local
```

Start the console development server on `http://localhost:5173`:

```sh
vp run dev
```

In a separate terminal, start the stateful stack and example services:

```sh
docker compose -f infra/compose.yaml up --build
```

The checked-in `.env.example` values are for local development only. Replace every secret before using the stack on a shared machine or network.

| Service          | Local endpoint                   |
| ---------------- | -------------------------------- |
| Console          | `http://localhost:5173`          |
| API              | `http://localhost:3000`          |
| OTLP/HTTP        | `http://localhost:4318`          |
| OTLP/gRPC        | `localhost:4317`                 |
| Collector health | `http://localhost:13133/healthz` |
| Checkout API     | `http://localhost:4101`          |

The console starts in an anonymous sandbox. The local admin-token path opens the durable bootstrap project and its real telemetry for development.

## Send OpenTelemetry data

Point an OTLP/HTTP exporter at the local Collector:

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_HEADERS=x-clear-ingest-key=local-demo-ingest-key
export OTEL_SERVICE_NAME=my-service
```

Clear accepts all three stable signals at the standard OTLP paths:

- `POST /v1/metrics`
- `POST /v1/logs`
- `POST /v1/traces`

The hosted endpoint at `https://otlp.clear.seufert.sh` supports OTLP/HTTP protobuf and JSON. OTLP/gRPC remains available only in the local contributor stack for this hackathon release.

See [docs/otel-quickstart.md](docs/otel-quickstart.md) for SDK and upstream Collector configuration.

## Example incident stack

The repository includes three real, instrumented services:

- `checkout-api`, with an intentionally naive retry loop
- `payments-stub`, a deterministic dependency that degrades under load
- `load-generator`, which produces a repeatable retry-amplification incident

The scenario first looks like a traffic surge. Requests rise while unique users stay flat, then retry-attributed traffic reveals the amplification loop. The submission video is deliberately scripted and narrated, and the overload is manufactured. The telemetry, service behavior, WebMCP calls, checkout code change, Render deployment, and recovery are real.

## Repository map

```text
apps/
  backend/          Effect HTTP API and application services
  collector/        Custom OpenTelemetry Collector distribution in Go
  console/          React, TanStack, StyleX, Base UI, and WebMCP surface
  checkout-api/     Intentionally broken example service
  checkout-web/     Customer-facing storefront for the example incident
  payments-stub/    Deterministic failing dependency
  load-generator/   Repeatable incident controller
packages/
  api-contract/     Typed Effect HTTP API contract
  domain/           Domain models and errors
  panel-dsl/        Agent-authored panel specification
  persistence/      Drizzle PostgreSQL and ClickHouse repositories
  telemetry/        Telemetry query and ingest models
  telemetry-gen/    Deterministic sandbox telemetry
infra/              Local Compose stack, Render deployment, and runbooks
docs/               Architecture, operation, integration, and design notes
video/              Scripted submission-video package
```

## Hosted limits

- One durable project per account and up to three active ingest keys.
- Raw metrics, logs, and traces are retained for 24 hours. Metric rollups are retained for 7 days.
- Hosted ingest supports OTLP/HTTP protobuf and JSON, not public OTLP/gRPC.
- The hackathon deployment is single-instance and does not claim high availability.
- The local Compose topology is for development and testing. Self-hosted operation is not supported for this release.
- The project has not completed an independent security audit or production load test.

## Documentation

- [Architecture](docs/architecture.md)
- [OpenTelemetry quickstart](docs/otel-quickstart.md)
- [Connecting a real project](docs/real-mode.md)
- [Local development stack](docs/self-hosting.md)
- [Infrastructure notes](infra/README.md)
- [Collector details](apps/collector/README.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## License

Clear is available under the [MIT License](LICENSE).
