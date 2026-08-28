# Checkout API

The public checkout service used by the Groundtruth incident stack. It emits
metrics, logs, and traces over OTLP and calls the private payments service.

`src/lib/retry.ts` is intentionally naive. It performs three immediate retries
without backoff, jitter, a retry budget, or a circuit breaker. Keep that bug in
the incident branch.

## HTTP surface

- `GET /healthz`
- `GET /readyz`
- `POST /v1/checkout`

The checkout route accepts credential-free browser requests only from the exact
`CHECKOUT_WEB_ORIGIN`. The Effect CORS middleware also handles preflight
requests.

## Configuration

Copy `.env.example` and set `PAYMENTS_SERVICE_TOKEN`. Configure the payments
address with either `PAYMENTS_BASE_URL` or Render's `PAYMENTS_HOSTPORT`.

Set `GROUNDTRUTH_INGEST_KEY` to add `x-groundtruth-ingest-key` to every OTLP
export. The standard OpenTelemetry exporter endpoint variables remain
supported.

When `GROUNDTRUTH_DEPLOY_EVENTS_URL` and `GROUNDTRUTH_INGEST_KEY` are present,
startup reports a deploy event using `RENDER_GIT_COMMIT` and
`RENDER_EXTERNAL_URL`. Reporting failures are logged and never prevent startup.

## Commands

```sh
vp run dev
vp run test
vp run build
vp run start
```

Build the container from the repository root so the workspace lockfile is in
the Docker context:

```sh
vp exec docker build -f apps/checkout-api/Dockerfile -t groundtruth-checkout .
```
