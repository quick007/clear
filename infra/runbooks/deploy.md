# Deployment runbook

## Before the first deployment

1. Review the paid plans in `infra/render.yaml`. ClickHouse requires the Standard 2 GB service plus a persistent disk.
2. Generate a strong Sites handoff secret. Store the same value in the Render `GROUNDTRUTH_SITE_HANDOFF_SECRET` secret and the Sites deployment. Never put it in Git or frontend JavaScript.
3. Import `infra/render.yaml` as a Render Blueprint. Render prompts for the handoff secret and the checkout example's `GROUNDTRUTH_INGEST_KEY`.
4. Use a temporary random value for the example ingest key during initial provisioning. Replace it after the hosted console can create a real project key.
5. Confirm that Render Postgres has an empty public IP allowlist and ClickHouse is a private service.

The Blueprint intentionally does not deploy either Sites frontend.

## Provisioning and migration order

The intended order is:

1. Render Postgres becomes reachable.
2. ClickHouse starts with its persistent disk and returns success from `/ping`.
3. The API pre-deploy command runs `infra/scripts/run-migrations.sh`.
4. PostgreSQL migrations run first under the persistence package's migration lock.
5. ClickHouse migrations run second from the ordered, checksummed SQL files.
6. The API starts and must pass `/health` before Render routes traffic.
7. The Collector starts and connects to the API over Render's private network.
8. Payments, checkout, and load-generator services become ready.

Migration retries are bounded to 30 attempts at 10 seconds each, for five minutes total. A failed migration stops the API deploy. Do not bypass a migration failure by starting a newer API against an older schema.

ClickHouse migrations never run through `/docker-entrypoint-initdb.d`. That path would only cover first boot and would drift from production upgrades.

## Domains and Sites

1. Add the Render custom domains declared in the Blueprint.
2. Copy the exact DNS targets Render supplies. Follow `infra/domains.md`.
3. Publish the console to Sites and attach `groundtruth.seufert.sh`.
4. Configure the Sites server with the shared handoff secret and the Render API origin.
5. Publish the checkout storefront as a separate Site and attach its chosen hostname.
6. Leave each platform's fallback hostname enabled until custom-domain TLS and health checks pass.

## Connect the example services

1. Sign in to the hosted console.
2. Create the project used by the checkout scenario.
3. Create an ingest key and copy it once.
4. Replace `GROUNDTRUTH_INGEST_KEY` on `groundtruth-checkout-api` in Render.
5. Sync the Blueprint so the payments and load-generator references receive the same value, then redeploy those services.
6. Verify metrics, logs, and traces separately before triggering a scenario.
7. Verify that checkout startup reports a deploy event using `RENDER_GIT_COMMIT` without blocking readiness if reporting fails.

## Release checks

Before routing judges to a release:

- API `/health` is healthy and reports both databases ready.
- Collector accepts OTLP/HTTP protobuf on `/v1/metrics`, `/v1/logs`, and `/v1/traces`.
- Invalid and conflicting ingest credentials are rejected.
- Checkout, payments, and load-generator `/readyz` checks pass.
- A known trace is visible with correlated logs and metrics.
- An SSE client reconnects and resumes from its last cursor.
- ClickHouse free disk remains above 30 percent.
- A fresh logical backup has been copied off the ClickHouse disk.

## Rollback

Application rollback is safe only when the previous application version is compatible with the already-applied schemas. Migrations are forward-only during normal deploys. Do not attempt to reverse PostgreSQL and ClickHouse independently during an active incident.

If a schema change is incompatible, deploy a forward repair. For data corruption, stop ingest and use the restore procedure in `backups.md` against fresh database instances, validate them, then change service connections deliberately.

ClickHouse has a persistent disk, so its deploys include downtime and cannot use Render's zero-downtime instance swap. Schedule ClickHouse image or configuration changes away from the recorded demo.
