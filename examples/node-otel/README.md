# Node OpenTelemetry example

A standalone Node program that emits one metric, one structured log, and one
trace through standard OTLP/HTTP protobuf exporters. It is an integration
example, not part of the deployed Clear runtime.

See [`USAGE.md`](USAGE.md) for Collector setup, environment variables, expected
signals, and verification commands.

## Run

```sh
vp -C examples/node-otel run emit
```

## Key files

- [`src/index.ts`](src/index.ts): SDK setup and emitted signals.
- [`collector-config.yaml`](collector-config.yaml): local debug Collector pipeline.
- [`test/export.test.ts`](test/export.test.ts): all-signal export verification.
