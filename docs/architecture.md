# Architecture

Clear separates telemetry transport, product state, telemetry storage, and presentation. Protocol parsing stays in official OpenTelemetry components, while repository and deployment authority stay outside the product.

## Product boundary

Clear reads and displays. It never executes.

The console can query telemetry, compose panels, annotate an incident, and show deploy events. It does not clone repositories, hold deployment keys, run infrastructure commands, approve changes, or merge code. A user's own agent performs a fix through the repository and infrastructure access it already has. Clear observes the resulting deploy event and recovery data.

## Component map

```text
                           human and user's agent
                                      |
                                      v
                           console on ChatGPT Sites
                           React + WebMCP site tools
                                      |
                           HTTPS API and SSE events
                                      |
                                      v
OpenTelemetry clients       Effect API       deploy-event webhooks
          |                    |  |                    |
          v                    |  |                    |
    Clear Collector ----------+  +--------------------+
   official receivers             |
   auth and batching               |
                                   v
                    +--------------+--------------+
                    |                             |
               PostgreSQL                    ClickHouse
               product state                 telemetry
```

## Data plane

`apps/collector` is a small OpenTelemetry Collector distribution built with the official Collector Builder. It contains:

- OTLP receivers for HTTP/Protobuf, HTTP/JSON, and local gRPC
- memory limiting, resource attribution, and project-partitioned batching
- a Clear ingest-key authentication extension
- a Clear exporter that sends bounded canonical OTLP JSON to the API

The Collector validates an ingest key with the API, receives its project ID, and overwrites any client-provided `groundtruth.project.id` resource attribute. Batches are partitioned by authenticated project so records from different projects do not share an export request.

The queue is bounded and in memory. Export failures are returned to OTLP callers after bounded retries so clients can apply their normal retry policy. The backend validates each bounded batch before persistence and responds only after all ClickHouse writes finish. Those writes span multiple tables and are not transactional, so a failure can leave part of a batch persisted. Hosted ingress exposes OTLP/HTTP protobuf and JSON for metrics, logs, and traces. OTLP/gRPC is retained for local development but is not a hosted hackathon endpoint.

## Control plane

`apps/backend` and `packages/api-contract` use Effect v4's HTTP API and Schema modules. The contract covers:

- session and Sites handoff authentication
- one durable project per hosted account and up to three active ingest keys
- metrics, log, and trace queries
- board state, alerts, incidents, hypotheses, notes, and deploy events
- a resumable server-sent event stream
- isolated two-hour sandbox sessions

Cookie-authenticated writes require an allowed browser origin. Sandbox sessions use a separate request header. Collector authorization and internal telemetry endpoints use a service credential that is distinct from project ingest keys.

## Storage

PostgreSQL is the durable source for product state:

- accounts and project ownership
- hashed ingest keys
- boards and panel specifications
- alert definitions and state
- incidents, hypotheses, timeline entries, and deploy events
- the durable event outbox

Drizzle owns the PostgreSQL schema and migrations. Reads prefer its relational query API when practical.

ClickHouse stores:

- metric points and exemplars
- logs and trace correlation fields
- spans, events, and links
- ten-second metric rollups

Every telemetry table begins its sorting key with `project_id` and has an expiry column enforced through ClickHouse TTL rules. Raw metrics, logs, and traces are retained for 24 hours. Metric rollups are retained for 7 days.

## Console and WebMCP

`apps/console` is a React application built with Vite+, TanStack Router and Query, StyleX, Base UI, Hugeicons, and ECharts. The deployment includes a thin server worker for trusted ChatGPT Sites identity handoff and health checks. It is not an application proxy.

The public homepage offers **Demo incident** and **Log in to create a project**. The application shell uses a sidebar for Board, Explore, Alerts, Incidents, and Settings. Explore combines Metrics, Logs, and Traces under shared service, environment, and time context. The website hides healthy connection chrome and all WebMCP implementation details.

The WebMCP registry uses the top-level imperative `document.modelContext` API. Effect Schema remains authoritative at the tool and API boundaries. General investigation capabilities exist for the session, while incident-specific capabilities are registered only when they are valid. This dynamic registry is an agent interface and is never displayed as product chrome.

Telemetry and user-authored content returned to an agent are marked untrusted. The server repeats all authorization and scope checks because browser schemas and annotations are hints, not a security boundary.

## Example incident

The real example stack consists of:

- `checkout-api`, whose retry helper intentionally retries immediately without backoff or a budget
- `payments-stub`, whose failure rate and latency increase under load
- `load-generator`, which drives deterministic baseline, blip, amplification, and recovery phases

All three services emit real OTLP metrics, logs, and traces. The deterministic generator in `packages/telemetry-gen` supports anonymous sandbox investigation without sharing data across visitors. The sandbox does not synthesize a code fix or deploy event.

## Hosted deployment

The hackathon deployment uses:

- ChatGPT Sites for the console and checkout storefront
- one Render 1 CPU, 2 GB stateful service with a 10 GB disk for the Effect API, Collector, PostgreSQL, ClickHouse, payments stub, and load generator
- one separate paid Render checkout API service so it can receive private traffic and a checkout-only commit produces an isolated real deploy in the video
- current `chatgpt.site` and `onrender.com` fallback hostnames, with the `seufert.sh` names reserved for a later manual custom-domain cutover

The hosted stack is single-instance. It does not claim horizontal scaling, high availability, or off-host backups. `infra/compose.yaml` remains a contributor-only local environment, not a supported self-hosted release.

## Current implementation status

| Area                    | Present                                                                                 | Remaining                                       |
| ----------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Domain and API contract | Effect schemas, typed endpoints, handlers, production server entry, service tests       | hosted integration smoke test                   |
| Collector               | official receivers, authentication, batching, exporter, integration tests               | hosted OTLP/HTTP verification                   |
| Persistence             | PostgreSQL and ClickHouse schemas, repositories, migrations, and backend runtime wiring | hosted disk and retention rehearsal             |
| Console                 | API-backed metrics, logs, traces, alerts, deploys, boards, and live event updates       | final hosted browser testing                    |
| WebMCP                  | dynamic registry, state-scoped tools, schemas, and unit tests                           | end-to-end ChatGPT and Chrome smoke tests       |
| Hosted auth             | typed one-time handoff, backend session, and thin Sites worker                          | deploy and verify the final Sites identity flow |
| Example stack           | instrumented storefront, checkout, payments, and load services                          | integrated hosted rehearsal                     |

The repository is a functional pre-release stack. It is not production-ready until the remaining deployment, authentication, security, and load-testing work is complete.
