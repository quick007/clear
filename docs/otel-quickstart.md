# OpenTelemetry quickstart

Clear accepts metrics, logs, and traces through standard OTLP. Use the official OpenTelemetry SDK for your language or an OpenTelemetry Collector. You do not need a Clear-specific SDK, proprietary exporter, or vendor agent.

## What you need

1. An OTLP endpoint.
2. A project ingest key.
3. A stable `service.name` for each service.

The current hosted OTLP/HTTP base endpoint is `https://clear-runtime.onrender.com`. The planned `https://otlp.clear.seufert.sh` hostname is not live yet.

For local development:

```sh
export CLEAR_INGEST_KEY=local-demo-ingest-key
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_HEADERS="x-clear-ingest-key=${CLEAR_INGEST_KEY}"
export OTEL_SERVICE_NAME=my-service
```

For the hosted service, replace the endpoint with `https://clear-runtime.onrender.com` and use the ingest key copied from your durable Clear project. Durable project login is waiting on the custom-domain cutover, so new hosted keys cannot be created through the fallback console yet. Do not use the checked-in local key outside isolated development.

## Supported transports

| Transport          | Local base endpoint     | Hosted base endpoint                      |
| ------------------ | ----------------------- | ----------------------------------------- |
| OTLP/HTTP protobuf | `http://localhost:4318` | `https://clear-runtime.onrender.com`      |
| OTLP/HTTP JSON     | `http://localhost:4318` | `https://clear-runtime.onrender.com`      |
| OTLP/gRPC          | `localhost:4317`        | not available in the hackathon deployment |

OTLP/HTTP uses the standard signal paths:

- `/v1/metrics`
- `/v1/logs`
- `/v1/traces`

The Collector accepts the key in either form:

```text
x-clear-ingest-key: <key>
Authorization: Bearer <key>
```

If both are present, they must match. Public examples use the environment variable name `CLEAR_INGEST_KEY`; the wire header is always `x-clear-ingest-key` unless the standard Bearer form is used.

## Configure an application SDK

Most official OpenTelemetry SDKs honor the standard environment variables above. If your SDK uses signal-specific variables, point all three at the same Collector:

```sh
export CLEAR_INGEST_KEY=local-demo-ingest-key
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://localhost:4318/v1/logs
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
export OTEL_EXPORTER_OTLP_HEADERS="x-clear-ingest-key=${CLEAR_INGEST_KEY}"
```

Prefer the SDK's batch processors and normal retry behavior. Clear applies bounded backpressure and does not promise to retain data that a client drops after an export failure.

Set useful resource attributes without putting secrets or high-cardinality request values on every signal:

```sh
export OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=development,service.namespace=checkout
```

`service.name` is especially important because Clear uses it throughout the board, logs, traces, and deploy annotations.

### Runnable Node example

[`examples/node-otel`](../examples/node-otel/USAGE.md) is a standalone program built only from official OpenTelemetry packages. It exports one metric, one structured log, and one correlated trace over OTLP/HTTP protobuf, then flushes all processors before exiting. Its focused test starts a local OTLP receiver and verifies all three requests plus configured headers.

## Configure an upstream Collector

An existing OpenTelemetry Collector can forward all signals to Clear over OTLP/HTTP:

```yaml
exporters:
  otlphttp/clear:
    endpoint: https://clear-runtime.onrender.com
    headers:
      x-clear-ingest-key: ${env:CLEAR_INGEST_KEY}

service:
  pipelines:
    metrics:
      exporters: [otlphttp/clear]
    logs:
      exporters: [otlphttp/clear]
    traces:
      exporters: [otlphttp/clear]
```

Add the exporter to your existing receivers and processors rather than replacing them. The complete examples in `apps/collector/config/examples/` include the surrounding receiver setup. Those internal examples retain some `GROUNDTRUTH_*` environment names for repository compatibility, but clients still send the public `x-clear-ingest-key` header.

For local OTLP/gRPC:

```yaml
exporters:
  otlp/clear:
    endpoint: localhost:4317
    tls:
      insecure: true
    headers:
      x-clear-ingest-key: ${env:CLEAR_INGEST_KEY}
```

Use TLS and remove `insecure: true` for any remote endpoint. The hosted hackathon deployment does not expose OTLP/gRPC.

If the upstream Collector runs inside Docker Desktop while the local Clear stack runs on the host, replace `localhost` with `host.docker.internal`. On Linux, use an explicit host-gateway mapping or a shared container network instead of assuming that hostname exists.

## Data model notes

Clear preserves core OTLP structure, including:

- resources, scopes, and schema URLs
- gauge, sum, histogram, exponential histogram, and summary metrics
- aggregation temporality, exemplars, and metric attributes
- trace IDs, span IDs, status, events, and links
- log severity, bodies, attributes, and trace correlation fields

The server enforces project scope from the authenticated ingest key. A client-provided `groundtruth.project.id` cannot override that scope.

## Limits

The deployed all-in-one Collector configuration starts with:

- 8 MiB inbound HTTP and gRPC messages
- 16 MiB canonical batches between Collector and API
- batches capped at 1,024 signal items
- a bounded 32-request in-memory exporter queue with one consumer
- ten seconds of bounded retry time for retryable backend failures

The separate local and hosted Collector configurations allow batches of up to 2,048 signal items and use a 128-request queue with four consumers. Those larger topology-specific values do not describe the deployed all-in-one service.

These are safety limits, not sizing promises. Review them together with API, ClickHouse, and client retry behavior before production use.

## API reference

- Interactive reference: [clear-runtime.onrender.com/docs](https://clear-runtime.onrender.com/docs)
- OpenAPI document: [clear-runtime.onrender.com/openapi.json](https://clear-runtime.onrender.com/openapi.json)

The API reference covers project operations and the deploy-event webhook. OTLP payload schemas follow the OpenTelemetry protocol rather than the Clear OpenAPI document.

## Troubleshooting

**The exporter receives `401`**

The ingest key is missing, invalid, revoked, or supplied twice with conflicting values.

**The exporter cannot connect**

Check the base URL, protocol, port, and TLS settings. Hosted OTLP/HTTP uses normal HTTPS on port 443. Local OTLP/HTTP normally uses port 4318. OTLP/gRPC normally uses port 4317 and is not part of the hosted hackathon release.

**Data appears under the wrong service**

Set `OTEL_SERVICE_NAME` or the SDK's `service.name` resource attribute before the provider starts.

**Some data is retried or rejected**

Check request size, client timeouts, Collector logs, API health, and ClickHouse capacity. Clear validates a bounded batch before persistence and acknowledges it only after all ClickHouse writes finish. The writes span multiple tables and are not transactional, so a failed request can leave part of a batch persisted.

**The local console does not show received data**

Check the Collector and API health endpoints, confirm the ingest key matches the bootstrap project, then confirm `service.name` is stable. The local stack does not provide a supported browser login to that durable project, so use API or storage checks when developing ingest locally.
