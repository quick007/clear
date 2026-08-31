# Clear

[![CI](https://github.com/quick007/clear/actions/workflows/ci.yml/badge.svg)](https://github.com/quick007/clear/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-f4b968.svg)](LICENSE)

**Your agent knows the code. Clear gives it the evidence.**

Clear is a live OpenTelemetry workspace shared by you and the coding agent you already use. Metrics, logs, traces, deploys, alerts, and incident context stay in one place. The same investigation surface is exposed as typed WebMCP site tools, so you can steer while your agent queries evidence, tests hypotheses, and composes the views that make a diagnosis legible.

Clear stops at observability. It never checks out your repository, stores deploy credentials, or executes a fix. Your agent uses the repository and infrastructure access it already has. The result flows back into Clear as a deploy event and recovering telemetry.

![Clear homepage with a translucent observability surface over its paper shader](media/devpost/outputs/clear-devpost-thumbnail.jpg)

## Try it

| Surface          | URL                                                                                |
| ---------------- | ---------------------------------------------------------------------------------- |
| Live app         | [clear.seufert.sh](https://clear.seufert.sh)                                       |
| Example checkout | [clear-checkout.seufert.chatgpt.site](https://clear-checkout.seufert.chatgpt.site) |
| Runtime health   | [api.clear.seufert.sh/health](https://api.clear.seufert.sh/health)                 |
| API reference    | [api.clear.seufert.sh/docs](https://api.clear.seufert.sh/docs)                     |
| Source           | [github.com/quick007/clear](https://github.com/quick007/clear)                     |

The anonymous sandbox and real OTLP runtime are live. Sign in with ChatGPT when you want to create a project and point your own exporter at Clear. The submission video is recorded against the real checkout stack.

### Thirty-second path

1. Open the live sandbox in ChatGPT's in-app browser with site tools available, or in Chrome with WebMCP enabled.
2. Select **Investigate an incident**. The walkthrough starts from a healthy baseline before introducing the controlled failure.
3. Copy the suggested prompt from the board into your agent conversation.
4. Keep the board visible while your agent queries telemetry, tests explanations, and composes the evidence you need.

Each visitor receives an isolated two-hour sandbox. It covers investigation and diagnosis, then resets cleanly. It does not pretend that a code change or deployment happened.

## Why WebMCP fits

Most observability products place a vendor-owned copilot beside a dashboard. Clear makes the observability surface itself operable by the agent you already use.

- The human and agent work from the same live evidence.
- Typed site tools cover metrics, logs, traces, alerts, deploys, boards, and incident context.
- The tool surface follows the work. Incident capabilities appear only while an incident is open.
- Agent-authored panels become durable, shared views instead of disposable chat output.
- Execution stays in the agent's existing repository and infrastructure environment.

The repository also includes a deterministic sandbox and a real, instrumented checkout stack. The submission video uses a scripted diagnosis against manufactured load. The traffic, telemetry, WebMCP calls, code change, Render deployment, deploy marker, and recovery are real.

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

For the hackathon, the stateful Clear services run together on one Render instance with a persistent disk. The checkout API is a separate Render service so a code push produces a real, isolated deployment. The console and storefront are published with ChatGPT Sites.

Read [the architecture guide](docs/architecture.md) for the detailed component and trust boundaries.

## OpenTelemetry, without a Clear SDK

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

The hosted runtime exposes OTLP/HTTP protobuf and JSON at `https://otlp.clear.seufert.sh`. Public OTLP/gRPC is intentionally out of scope for the hackathon deployment, but it remains available in the local contributor stack.

See the [OpenTelemetry quickstart](docs/otel-quickstart.md) for application and upstream Collector setup.

## Run locally

The Compose stack is a contributor environment, not a supported self-hosted release. Start from a fresh clone with Node.js 24 or newer, [Vite+](https://viteplus.dev/) 0.3.x, Docker Engine with Compose v2, and at least 4 GB available to Docker.

Verify the repository without configuring any environment files:

```sh
vp install
vp run ready
```

`vp run ready` runs Vite+'s format, lint, and type checks, then the fast workspace test suites and every workspace build script. Database integration tests are opt-in because they start PostgreSQL and ClickHouse; CI runs them in the dedicated [persistence integration job](.github/workflows/ci.yml). It is the quickest fresh-clone check before starting services.

Before starting local services, create the three uncommitted configuration files:

```sh
cp .env.example .env
cp apps/console/.env.example apps/console/.env.local
cp apps/checkout-web/.env.example apps/checkout-web/.env.local
```

The runtime and browser configuration remain strict. Do not skip these copies before running the console or Compose stack.

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

The console starts in an anonymous sandbox. The checked-in development secrets are only for local use. Replace every secret before exposing the stack to a shared machine or network.

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
video/              Script, captions, shot list, and media tooling
media/devpost/      Reproducible Devpost source captures and outputs
```

## Hosted release boundaries

- One durable project per account and up to three active ingest keys.
- Raw metrics, logs, and traces are retained for 24 hours. Metric rollups are retained for 7 days.
- Hosted ingest supports OTLP/HTTP protobuf and JSON.
- The hackathon deployment is single-instance and does not claim high availability.
- The local Compose topology is for development and testing. Self-hosted operation is not supported for this release.
- The project has not completed an independent security audit or production load test.

## Documentation

- [Architecture](docs/architecture.md)
- [Submission guide and evidence map](docs/submission-guide.md)
- [OpenTelemetry quickstart](docs/otel-quickstart.md)
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
