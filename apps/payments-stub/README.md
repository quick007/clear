# Payments Stub

A private, deterministic payments dependency for the Clear incident
stack. It exports real OTLP metrics, logs, and traces and models a small upstream
failure becoming worse under retry pressure.

This is canonical deployed incident-service code. The hosted Render runtime
runs it privately alongside the backend, Collector, and state stores.

## HTTP surface

- `GET /healthz`
- `GET /readyz`
- `POST /v1/authorize`, authenticated with `SERVICE_TOKEN`
- `GET /v1/admin/state`, authenticated with `CONTROL_TOKEN`
- `PUT /v1/admin/failure-rate`, authenticated with `CONTROL_TOKEN`
- `POST /v1/admin/reset`, authenticated with `CONTROL_TOKEN`

The failure decision is deterministic for the configured seed and request
sequence. Request volume beyond `EXPECTED_RPS` increases both the effective
failure rate and latency, which lets the checkout service's immediate retries
create a measurable feedback loop.

## Configuration

Copy `.env.example` and replace both local bearer tokens outside local
development. The baseline failure model and overload response are configured
by `FAILURE_RATE`, `EXPECTED_RPS`, `OVERLOAD_GAIN`, and the latency variables.

Set `GROUNDTRUTH_INGEST_KEY` to add `x-clear-ingest-key` to every OTLP
export. The standard OpenTelemetry exporter endpoint variables remain
supported.

## Commands

```sh
vp run dev
vp run test
vp run build
vp run start
```

## Key files

- [`src/main.ts`](src/main.ts): Effect runtime and HTTP server.
- [`src/routes.ts`](src/routes.ts): payment and control routes.
- [`src/failure-model.ts`](src/failure-model.ts): deterministic failure and overload model.
- [`src/payments-service.ts`](src/payments-service.ts): authorization behavior.
- [`src/telemetry.ts`](src/telemetry.ts): OpenTelemetry SDK and exporters.

```sh
vp exec docker build -f apps/payments-stub/Dockerfile -t clear-payments .
```
