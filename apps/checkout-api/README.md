# Checkout API

The public checkout service used by the Clear incident stack. It emits
metrics, logs, and traces over OTLP and calls the private payments service.

This is canonical deployed example-service code. Render runs it separately from
the stateful Clear runtime so a checkout-only commit produces a real isolated
deploy during the incident walkthrough.

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
bound on metric series cardinality. Request IDs remain available on traces and
a deterministic sample of failure logs for correlation, but are never metric
dimensions.

`http.server.requests` records one completed incoming checkout, and
`http.server.duration` covers its entire payment workflow. Each payment attempt,
including immediate retries, is recorded separately in
`upstream.client.requests` and `upstream.client.duration` with one-based
`attempt` and boolean-string `retry` attributes.

## Configuration

Copy `.env.example` and set `PAYMENTS_SERVICE_TOKEN`. Configure the payments
address with either `PAYMENTS_BASE_URL` or Render's `PAYMENTS_HOSTPORT`.

In the hosted stack, set `GROUNDTRUTH_RUNTIME_HOSTPORT` to the Clear runtime's
private host and port. The service derives its payments address, deploy-event
endpoint, and OTLP logs, metrics, and traces endpoints from that value. This is
the preferred Render configuration because it keeps service-to-service traffic
on the private network.

Set `GROUNDTRUTH_INGEST_KEY` to add `x-clear-ingest-key` to every OTLP
export. For local or standalone deployments, direct endpoint overrides remain
supported: `PAYMENTS_BASE_URL`, `GROUNDTRUTH_DEPLOY_EVENTS_URL`, and the
standard `OTEL_EXPORTER_OTLP_*_ENDPOINT` variables take precedence over the
derived runtime endpoints.

When a deploy-event endpoint and `GROUNDTRUTH_INGEST_KEY` are available, startup
reports a deploy event using `RENDER_GIT_COMMIT` and `RENDER_EXTERNAL_URL`.
Reporting failures are logged and never prevent startup.

## Commands

```sh
vp run dev
vp run test
vp run build
vp run start
```

## Key files

- [`src/main.ts`](src/main.ts): Effect runtime and HTTP server.
- [`src/routes.ts`](src/routes.ts): health and checkout routes.
- [`src/checkout-service.ts`](src/checkout-service.ts): checkout workflow.
- [`src/lib/retry.ts`](src/lib/retry.ts): intentionally broken retry policy.
- [`src/telemetry.ts`](src/telemetry.ts): OpenTelemetry SDK and exporters.

Build the container from the repository root so the workspace lockfile is in
the Docker context:

```sh
vp exec docker build -f apps/checkout-api/Dockerfile -t clear-checkout .
```
