# Deployment runbook

## Before the first deployment

1. Push the exact release commit to the public GitHub repository. Render cannot build local or uncommitted files.
2. In the intended Render workspace, create a Blueprint from the `main` branch with Blueprint Path set to `infra/render.yaml`.
3. Review the live estimate before confirming it. The Blueprint creates one paid `1c-2g` service with a 10 GB disk and one separate free checkout API service.
4. Generate a strong Sites handoff secret. Store the same value in the Render `GROUNDTRUTH_SITE_HANDOFF_SECRET` variable and the Sites deployment. Never put it in Git or frontend JavaScript.
5. Confirm the stateful service has exactly one instance and that the disk is mounted at `/var/lib`.

The Blueprint intentionally does not deploy either Sites frontend. The hosted API leaves `GROUNDTRUTH_ADMIN_TOKEN` unset and authenticates through the Sites handoff.

## Stateful service startup

`clear-runtime` starts dependencies in this order:

1. Initialize PostgreSQL and ClickHouse under the persistent `/var/lib` mount when their data directories are empty.
2. Start both databases on internal listeners.
3. Wait for `pg_isready` and ClickHouse `/ping`.
4. Start Nginx on Render's public port.
5. Run committed PostgreSQL migrations, then committed ClickHouse migrations.
6. Start the Effect API and wait for its health check.
7. Start the Clear Collector, payments stub, and load generator.

Nginx routes the standard OTLP/HTTP signal paths to the Collector and the remaining public surface to the Effect API. The authenticated internal payments route exists for the separate checkout API. The process supervisor treats an unexpected required-child exit as a service failure and handles termination for all children.

Database readiness retries are bounded. Invalid configuration, authentication failures, migration checksum mismatches, and migration command failures stop immediately. Do not bypass a migration failure by starting a newer API against an older schema.

## Domains and Sites

1. Publish the console and checkout storefront as separate Sites projects.
2. Configure the console build and worker with the current `clear-runtime.onrender.com` origin and the shared handoff secret.
3. Configure the checkout build with the current `clear-checkout-api.onrender.com` origin.
4. Set the matching public origins in Render's environment before deploying.
5. Keep all fallback hostnames enabled and verify them before any optional custom-domain cutover.

Custom domains are not declared in the Blueprint. Attach them manually only after the owning DNS zone is available, then copy the exact targets Render and Sites provide and follow `infra/domains.md`. Durable login remains disabled on the fallback cross-site hostnames.

## Example services

The stateful service owns the payments stub, load generator, and demo ingest key. Render copies the same generated ingest key and payment service token into the separate `clear-checkout-api` service through Blueprint service references.

The two Render services exchange telemetry, payment requests, and deploy events over Render's private network. The Blueprint supplies each service's internal host and supported non-reserved port. Deploy-event reporting failure never blocks readiness.

The checkout service's build filter contains only `apps/checkout-api` and required workspace files. The stateful service excludes that directory. A focused checkout commit therefore produces the isolated real deployment required by the video.

## Release checks

Before routing judges to a release:

- `https://clear-runtime.onrender.com/health` reports both databases ready.
- `https://clear-checkout-api.onrender.com/readyz` passes.
- The Collector accepts OTLP/HTTP protobuf and JSON on `/v1/metrics`, `/v1/logs`, and `/v1/traces`.
- Invalid and conflicting ingest credentials are rejected.
- A known trace is visible with correlated logs and metrics.
- An SSE client reconnects and resumes from its last cursor.
- ClickHouse free disk remains above 30 percent.
- The console login handoff passes in a fresh ChatGPT browser session.
- The anonymous demo remains isolated across two fresh sessions.
- A checkout-only commit deploys only `clear-checkout-api` and emits one matching deploy annotation.

## Rollback

Application rollback is safe only when the previous application version is compatible with the already-applied schemas. Migrations are forward-only during normal deploys. If a schema change is incompatible, deploy a forward repair.

The stateful service has one persistent disk and does not use zero-downtime instance replacement. Schedule database image or configuration changes away from the recorded demo. The hackathon deployment has no off-host backup, so do not represent it as durable production infrastructure.
