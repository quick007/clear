# Load Generator

An always-on internal service that drives deterministic checkout traffic and
records the incident screenplay as explicit, timestamped phase transitions.

This is incident support tooling rather than product runtime code. The hosted
Render stack runs it as an internal process for the scripted incident, while
contributors can run it independently against local checkout and payments
services.

## HTTP surface

- `GET /healthz`
- `GET /readyz`
- `GET /v1/scenario`
- `POST /v1/scenario/start`
- `POST /v1/scenario/recover`
- `POST /v1/scenario/stop`

Scenario routes require `Authorization: Bearer <CONTROL_TOKEN>`. Starting a run
returns its seed, rate, deterministic user count, durations, counters, and
transition history. The service moves through baseline, blip, and amplification
until an operator requests recovery or the maximum duration is reached.

## Configuration

Copy `.env.example`. Configure both service addresses with full base URLs or
Render host and port values through `CHECKOUT_HOSTPORT` and
`PAYMENTS_HOSTPORT`. `PAYMENTS_CONTROL_TOKEN` must match the payments stub.

`AUTOSTART=true` starts the default scenario when the service becomes ready.
The default is false so rehearsals can begin from a known state.

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

```sh
vp exec docker build -f examples/load-generator/Dockerfile -t clear-load .
```

## Key files

- [`src/main.ts`](src/main.ts): Effect runtime and HTTP server.
- [`src/scenario-controller.ts`](src/scenario-controller.ts): phase transitions and counters.
- [`src/checkout-client.ts`](src/checkout-client.ts): generated checkout requests.
- [`src/payments-admin.ts`](src/payments-admin.ts): controlled upstream state.
- [`src/telemetry.ts`](src/telemetry.ts): generator telemetry.
