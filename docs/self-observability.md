# Self-observability and public status

Clear uses the same standard OpenTelemetry path for its own application
services that it offers to connected projects. The hosted services export to
the co-located Clear Collector, which authenticates and stores the signals in
the bootstrap telemetry project.

## What Clear records about itself

- `checkout-api`, `payments-stub`, and `load-generator` emit their application
  metrics, logs, and traces.
- The Effect backend emits server request counts and duration, process uptime
  and memory gauges, and server traces.
- The backend identifies itself as `clear-api` and uses the current Render Git
  commit as its service version when that value is available.

This is application instrumentation. Clear does not claim access to Render's
managed infrastructure metrics, deploy logs, billing data, or account state.

The backend does not export logs in this integration. Collector-to-backend
telemetry routes are excluded from backend request metrics, tracing, and
response logging so exporting telemetry cannot recursively produce more
telemetry. Health and authentication routes are also excluded from tracing.

## Public status surface

The console serves a public read-only view at
[`/status`](https://clear.seufert.sh/status). Its typed source endpoint is:

```text
GET /v1/public/status
```

The endpoint returns a bounded snapshot with:

- API, telemetry intake, and storage component states
- the current application revision
- recent request rate and p95 latency for an explicit Clear service allowlist
- a server observation time and short human-readable summaries

The telemetry-intake component uses the continuously exported metrics stream as
its heartbeat. Logs and traces are event-driven, so an otherwise quiet service
does not become degraded merely because those signals have no recent events.

The endpoint does not accept a project ID, filters, a query language, or a time
range. It does not return account or project identifiers, user information,
ingest keys, arbitrary service names or attributes, raw metric points outside
the bounded window, logs, traces, incidents, or deploy details. Unknown service
names are dropped rather than copied into the public response. Internal errors
produce a generic unavailable response.

This route is a status projection for the Clear deployment. It is not a generic
public-dashboard or project-sharing mechanism.

## Configuration

Public status is opt-in and disabled by default:

```sh
GROUNDTRUTH_PUBLIC_STATUS_ENABLED=false
```

Set it to `true` only for a deployment whose bootstrap telemetry project is
intended to be public. The hosted Render Blueprint enables it for the Clear
status page. The status route has a dedicated public rate-limit bucket and does
not grant access to authenticated or project-scoped API groups.

## Privacy boundary

The backend runtime redacts authentication cookies, authorization headers,
Clear ingest keys, internal project headers, and sandbox-session headers from
framework logs and spans. Status responses use fixed labels and summaries
instead of reflecting telemetry attributes or backend error text.

These controls protect the status surface, but they do not sanitize arbitrary
telemetry at ingest. Services must still avoid placing secrets or unnecessary
personal data in metric attributes, log bodies, span attributes, and resource
metadata.
