# Checkout API

The public checkout service used by the Clear incident stack. It emits
metrics, logs, and traces over OTLP and calls the private payments service.

`src/lib/retry.ts` is intentionally naive. It performs three immediate retries
without backoff, jitter, a retry budget, or a circuit breaker. Keep that bug in
the incident branch.

## HTTP surface

- `GET /healthz`
- `GET /readyz`
- `POST /v1/checkout`

The checkout route is credential-free. Browsers receive CORS permission only
for the exact `CHECKOUT_WEB_ORIGIN`, and the Effect middleware handles
preflight requests. CORS is not authentication, so non-browser callers remain
subject to the limits below.

The public route accepts at most 8 KiB of JSON, validates bounded identifiers,
and rejects order totals above $100,000 or item counts above 100. A 12,000
request-per-minute, per-address limiter allows the generated incident traffic
while bounding abuse, and a 64-request concurrency gate sheds excess work before
it reaches payments. Health checks bypass both traffic controls.

Metric `user.id` values are deterministically mapped into 8,192 buckets. This
keeps the unique-user signal useful for the incident while placing a hard upper
bound on metric series cardinality. Request IDs remain available on logs and
traces for correlation, but are never metric dimensions.

`http.server.requests` records one completed incoming checkout, and
`http.server.duration` covers its entire payment workflow. Each payment attempt,
including immediate retries, is recorded separately in
`upstream.client.requests` and `upstream.client.duration` with one-based
`attempt` and boolean-string `retry` attributes.

## Configuration

Copy `.env.example` and set `PAYMENTS_SERVICE_TOKEN`. Configure the payments
address with either `PAYMENTS_BASE_URL` or Render's `PAYMENTS_HOSTPORT`.

Set `GROUNDTRUTH_INGEST_KEY` to add `x-clear-ingest-key` to every OTLP
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
vp exec docker build -f apps/checkout-api/Dockerfile -t clear-checkout .
```
