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
4. Run committed PostgreSQL migrations, then committed ClickHouse migrations.
5. Start the Effect API and wait for its health check.
6. Start the Clear Collector, payments stub, and load generator.
7. Start Nginx on Render's public port.

Nginx routes `api.clear.seufert.sh` to the Effect API and `otlp.clear.seufert.sh` to the Collector. The authenticated internal payments route exists for the separate checkout API. The process supervisor treats an unexpected required-child exit as a service failure and handles termination for all children.

Database readiness retries are bounded. Invalid configuration, authentication failures, migration checksum mismatches, and migration command failures stop immediately. Do not bypass a migration failure by starting a newer API against an older schema.

## Domains and Sites

1. Add the Render custom domains declared in the Blueprint.
2. Copy the exact DNS targets Render supplies. Follow `infra/domains.md`.
3. Publish the console to Sites and attach `clear.seufert.sh`.
4. Configure the Sites server with `https://api.clear.seufert.sh` and the shared handoff secret.
5. Publish the checkout storefront as a separate Site and attach `checkout.clear.seufert.sh`.
6. Leave each platform's fallback hostname enabled until custom-domain TLS and health checks pass.

## Example services

The stateful service owns the payments stub, load generator, and demo ingest key. Render copies the same generated ingest key and payment service token into the separate `clear-checkout-api` service through Blueprint service references.

The checkout service exports telemetry to `https://otlp.clear.seufert.sh`, calls the authenticated payments route on `https://api.clear.seufert.sh`, and reports its Render revision to the deploy-event endpoint during startup. Deploy-event reporting failure never blocks readiness.

The checkout service's build filter contains only `apps/checkout-api` and required workspace files. The stateful service excludes that directory. A focused checkout commit therefore produces the isolated real deployment required by the video.

## Release checks

Before routing judges to a release:

- `https://api.clear.seufert.sh/health` reports both databases ready.
- `https://checkout-api.clear.seufert.sh/readyz` passes.
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
