# OpenTelemetry quickstart

Clear accepts metrics, logs, and traces through standard OTLP. You do not need a Clear-specific SDK.

## What you need

1. An OTLP endpoint.
2. A project ingest key.
3. A stable `service.name` for each service.

For local development:

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_HEADERS=x-clear-ingest-key=local-demo-ingest-key
export OTEL_SERVICE_NAME=my-service
```

For the hosted service, use the endpoint and ingest key copied from your Clear project. Do not use the checked-in local key outside isolated development.

## Supported transports

| Transport          | Base endpoint                   | Availability           |
| ------------------ | ------------------------------- | ---------------------- |
| OTLP/HTTP protobuf | `https://otlp.clear.seufert.sh` | hosted and local       |
| OTLP/HTTP JSON     | `https://otlp.clear.seufert.sh` | hosted and local       |
| OTLP/gRPC          | `localhost:4317`                | local development only |

OTLP/HTTP uses the standard signal paths:

- `/v1/metrics`
- `/v1/logs`
- `/v1/traces`

The Collector accepts the key in either form:

```text
x-clear-ingest-key: <key>
Authorization: Bearer <key>
```

If both are present, they must match.

## Configure an application SDK

Most OpenTelemetry SDKs honor the standard environment variables above. If your SDK uses signal-specific variables, point all three at the same Collector:

```sh
export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://localhost:4318/v1/logs
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
export OTEL_EXPORTER_OTLP_HEADERS=x-clear-ingest-key=local-demo-ingest-key
```

Prefer the SDK's batch processors and normal retry behavior. Clear applies bounded backpressure and does not promise to retain data that a client drops after an export failure.

Set useful resource attributes without putting secrets or high-cardinality request values on every signal:

```sh
export OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=development,service.namespace=checkout
```

`service.name` is especially important because Clear uses it throughout the board, logs, traces, and deploy annotations.

## Configure an upstream Collector

An existing OpenTelemetry Collector can forward all signals to Clear over OTLP/HTTP:

```yaml
exporters:
  otlphttp/clear:
    endpoint: https://otlp.clear.seufert.sh
    headers:
      x-clear-ingest-key: ${env:GROUNDTRUTH_INGEST_KEY}

service:
  pipelines:
    metrics:
      exporters: [otlphttp/clear]
    logs:
      exporters: [otlphttp/clear]
    traces:
      exporters: [otlphttp/clear]
```

Add the exporter to your existing receivers and processors rather than replacing them. The full examples in `apps/collector/config/examples/` show HTTP and gRPC variants.

For local OTLP/gRPC:

```yaml
exporters:
  otlp/clear:
    endpoint: localhost:4317
    tls:
      insecure: true
    headers:
      x-clear-ingest-key: ${env:GROUNDTRUTH_INGEST_KEY}
```

Use TLS and remove `insecure: true` for any remote endpoint.

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

The checked-in Collector configuration starts with:

- 8 MiB inbound HTTP and gRPC messages
- 16 MiB canonical batches between Collector and API
- batches capped at 2,048 signal items
- a bounded 128-request in-memory exporter queue
- ten seconds of bounded retry time for retryable backend failures

These are safety limits, not sizing promises. Review them together with API, ClickHouse, and client retry behavior before production use.

## Troubleshooting

**The exporter receives `401`**

The ingest key is missing, invalid, revoked, or supplied twice with conflicting values.

**The exporter cannot connect**

Check the base URL, protocol, port, and TLS settings. Hosted OTLP/HTTP uses normal HTTPS on port 443. Local OTLP/HTTP normally uses port 4318. OTLP/gRPC normally uses port 4317 and is not part of the hosted hackathon release.

**Data appears under the wrong service**

Set `OTEL_SERVICE_NAME` or the SDK's `service.name` resource attribute before the provider starts.

**Some data is retried or rejected**

Check request size, client timeouts, Collector logs, API health, and ClickHouse capacity. A bounded batch is accepted or rejected atomically in the current implementation.

**The local console does not show received data**

Check the Collector and API health endpoints, confirm the ingest key matches the selected project, then confirm `service.name` is stable before troubleshooting the browser.
