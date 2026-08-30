# Standard OpenTelemetry Node example

This standalone Node program uses only official OpenTelemetry packages. It sends one counter
measurement, one structured log record, and one span to any OTLP/HTTP protobuf endpoint, then
calls `NodeSDK.shutdown()` so every processor flushes before the process exits.

It emits:

- metric `example.jobs.completed`
- structured log body `{ action: "job.completed", jobId: "job-42", result: "success" }`
- trace span `example.job`

The log is emitted while the span is active, so an OTLP backend can correlate their trace and span
IDs.

## Install

From the repository root:

```sh
vp install
```

## Verify against an OpenTelemetry Collector

Start the official Collector with the included debug configuration from the repository root:

```sh
docker run --rm \
  -p 4318:4318 \
  -v "$PWD/examples/node-otel/collector-config.yaml:/etc/otelcol/config.yaml:ro" \
  otel/opentelemetry-collector:0.159.0 \
  --config=/etc/otelcol/config.yaml
```

In another terminal, set standard OpenTelemetry environment variables and run the example:

```sh
export OTEL_SERVICE_NAME=node-otel-example
export OTEL_RESOURCE_ATTRIBUTES="deployment.environment.name=local"
export OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
vp -C examples/node-otel run emit
```

The program prints its success message only after shutdown completes. The Collector output should
contain `example.jobs.completed`, `job.completed`, and `example.job` in its metric, log, and trace
pipelines.

For a protected endpoint, add its standard OTLP header configuration before running:

```sh
export OTEL_EXPORTER_OTLP_HEADERS="api-key=replace-me"
```

`OTEL_EXPORTER_OTLP_ENDPOINT` is a base URL. The official exporters append `/v1/metrics`,
`/v1/logs`, and `/v1/traces`. If a backend provides separate signal URLs, use the standard
`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, and
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` variables instead. Signal-specific HTTP endpoint values must
include their `/v1/...` path.

## Validate the example

The focused test starts a local OTLP receiver, runs the example, and verifies that all three
protobuf requests are non-empty and include configured headers:

```sh
vp -C examples/node-otel test
vp -C examples/node-otel run check
```
