# Clear Collector

This service is Clear's OpenTelemetry data plane. It accepts metrics, logs, and traces through standard OTLP transports, authenticates each request to a Clear project, and forwards bounded canonical OTLP batches to the Effect backend.

Protocol parsing stays in the official OpenTelemetry Collector components. Clear does not implement protobuf or gRPC handlers.

In the hosted deployment the Collector runs inside the stateful Render runtime
and receives OTLP/HTTP through the shared ingress. The local distribution also
exposes OTLP/gRPC.

## Component pipeline

Each stable signal follows the same path:

```text
OTLP receiver
  -> Clear ingest authentication
  -> memory limiter
  -> project resource attribution
  -> project-partitioned batch processor
  -> bounded Clear HTTP exporter
  -> Effect backend
```

The generated distribution contains:

- The official OTLP receiver for gRPC, HTTP/protobuf, and HTTP/JSON.
- The official memory limiter, resource, and batch processors.
- The official health check extension.
- A small Clear authentication extension.
- A small Clear exporter built on `exporterhelper` for retries, bounded queueing, and observability.

Component versions are pinned in `builder-config.yaml`. The OpenTelemetry Collector Builder generates the runtime shell.

## Key files

- [`builder-config.yaml`](builder-config.yaml): pinned Collector distribution.
- [`config/local.yaml`](config/local.yaml): local HTTP and gRPC pipeline.
- [`config/hosted-http.yaml`](config/hosted-http.yaml): hosted HTTP pipeline.
- [`internal/ingestauthextension/`](internal/ingestauthextension): project-key authentication.
- [`internal/groundtruthexporter/`](internal/groundtruthexporter): bounded backend exporter.
- [`integration/`](integration): generated-distribution and all-signal tests.

## Authentication and project isolation

Clients send one of these headers:

```text
x-clear-ingest-key: <key>
Authorization: Bearer <key>
```

If both headers are present, they must contain the same key. Repeated or conflicting credentials are rejected.

The authentication extension calls:

```text
POST /internal/v1/ingest/authorize
Authorization: Bearer <GROUNDTRUTH_SERVICE_TOKEN>
Content-Type: application/json

{"ingestKey":"..."}
```

The backend returns `{"projectId":"<uuid-v7>"}`. Successful lookups are cached by a SHA-256 key fingerprint for one minute. The authenticated key is preserved only in request metadata so the batch processor can isolate it and the backend can revalidate it after the authorization cache lookup. Raw ingest keys are never stored in the cache or added to telemetry resource attributes, log records, or payloads.

The project ID and original ingest key are placed in Collector client metadata. The resource processor overwrites `groundtruth.project.id` on every resource, so a client cannot spoof project attribution. The batch processor partitions on both metadata values, which prevents one batch from mixing projects or credentials. The ingest key metadata is never mapped into a resource attribute.

## Internal export contract

The exporter sends canonical OTLP JSON produced by the official pdata marshalers. The private service-to-service headers below retain their existing compatibility names. Telemetry clients use `x-clear-ingest-key` and never send these internal headers.

```text
POST /internal/v1/telemetry/metrics
POST /internal/v1/telemetry/logs
POST /internal/v1/telemetry/traces
Authorization: Bearer <GROUNDTRUTH_SERVICE_TOKEN>
X-Groundtruth-Project-Id: <uuid-v7>
X-Groundtruth-Ingest-Key: <original-ingest-key>
Content-Type: application/json
```

The checked-in local and hosted configurations send these internal requests without compression. The ingest key header lets the backend reject a key revoked after the Collector authorization cache was populated. The header is authentication metadata and is not copied into canonical OTLP JSON. This preserves the OTLP resource, scope, schema URL, metric temporality, exemplar, trace, span, event, link, and log correlation structures for backend normalization.

The backend validates each bounded batch before persistence and returns success only after every ClickHouse table write finishes. ClickHouse persistence spans multiple tables and is not transactional, so a failed request can leave part of a batch persisted. The official receiver returns a normal OTLP success response after acceptance, a retryable error for throttling or backend availability failures, and a permanent error for invalid data. Record-level partial success is intentionally not invented at the exporter boundary. If the backend later adds record-level rejection, its typed response and the receiver response path must be extended together.

## Local use

Requirements:

- Go 1.25 or newer.
- A Clear backend exposing the internal authorization and telemetry endpoints.

Build the pinned distribution:

```sh
make build
```

Run both OTLP transports:

```sh
export GROUNDTRUTH_BACKEND_ENDPOINT=http://localhost:3000
export GROUNDTRUTH_SERVICE_TOKEN=replace-with-the-shared-service-token
./bin/clear-collector --config=config/local.yaml
```

Local endpoints:

| Purpose   | Endpoint                                         |
| --------- | ------------------------------------------------ |
| OTLP/gRPC | `localhost:4317`                                 |
| OTLP/HTTP | `http://localhost:4318/v1/{metrics,logs,traces}` |
| Health    | `http://localhost:13133/healthz`                 |

An endpoint without a URI scheme, such as Render's private `backend:10000` host and port value, is normalized to plain HTTP. Explicit `http://` and `https://` endpoints are also accepted.

## SDK configuration

For OTLP/HTTP:

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_HEADERS=x-clear-ingest-key=replace-with-your-ingest-key
```

For OTLP/gRPC:

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_HEADERS=x-clear-ingest-key=replace-with-your-ingest-key
```

The `config/examples` directory also contains upstream Collector exporter configurations for HTTP and gRPC. The gRPC example is for local development because the hosted hackathon deployment exposes OTLP/HTTP only.

OTLP/HTTP accepts uncompressed and gzip-compressed Protobuf and Protobuf JSON at the standard paths. Unknown JSON fields are ignored by the upstream OTLP decoder as required by the protocol.

## Bounds and backpressure

The checked-in local and separate Collector configurations apply these initial limits:

- 8 MiB inbound requests before and after HTTP decompression, and 8 MiB gRPC messages.
- 16 MiB canonical JSON batches between the Collector and backend.
- A 384 MiB soft memory limit with a 96 MiB spike allowance.
- Batches capped at 2,048 signal items and partitioned by project and ingest key.
- A bounded 128-request exporter queue with four consumers.
- Ten seconds of bounded retry time for retryable backend failures.
- Synchronous queue results so OTLP callers receive downstream export failures.

The deployed all-in-one configuration is smaller: it caps batches at 1,024 signal items and uses a 32-request queue with one consumer. The remaining request-size, memory, retry, and synchronous-result limits are unchanged.

The queue is intentionally in memory. Collector authentication context is not safe to persist through the upstream persistent queue abstraction, and hosted v1 runs one Collector instance.

## Hosted configuration

The hosted configuration binds OTLP/HTTP behind the stateful Render service's Nginx ingress. The canonical public endpoint is `https://otlp.clear.seufert.sh`. The Render hostname remains enabled as an operational fallback, and the health listener remains private.

`config/local.yaml` exposes gRPC and HTTP for contributor development. Hosted gRPC is deferred for the hackathon release.

## Container

Build from the monorepo root so the Docker context matches the `COPY` paths:

```sh
docker build -f apps/collector/Dockerfile -t clear-collector .
```

The default container command uses `config/local.yaml`. Override it for Render:

```sh
docker run --rm \
  -e PORT=10000 \
  -e GROUNDTRUTH_BACKEND_ENDPOINT=backend:10000 \
  -e GROUNDTRUTH_SERVICE_TOKEN=replace-with-the-shared-service-token \
  clear-collector --config=/etc/groundtruth/hosted-http.yaml
```

## Verification

Run package tests:

```sh
make test
```

Validate the generated distribution and local configuration:

```sh
make validate
```

Run the generated binary against a fake backend and exercise metrics, logs, and traces over HTTP/JSON, gzip HTTP/protobuf, and gRPC:

```sh
make integration
```

The integration test also verifies project attribution, ingest-key forwarding without payload leakage, service authentication, unknown JSON field handling, and rejection of an invalid ingest key.
