# Security policy

Clear receives sensitive operational data. Treat the current repository as pre-release software until the hosted path completes a security review. The local Compose stack is for contributor development only.

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub Security Advisories](https://github.com/quick007/clear/security/advisories/new).

Include the affected component, reproduction steps, impact, and any suggested mitigation. Do not open a public issue for an unpatched vulnerability. Do not include live credentials, customer telemetry, or data from systems you do not own.

You can expect an initial acknowledgement within seven days. A fix timeline depends on severity and the maturity of the affected component. Please give maintainers reasonable time to investigate before public disclosure.

## Supported versions

Clear has not published a stable release. Security fixes target the latest commit on `main`. Older commits, forks, and hosted copies are not maintained by this project.

## Trust boundaries

- Clear observes systems. It must not hold repository, deployment, or infrastructure-control credentials.
- OTLP ingest keys grant write access to one project. They are secrets and must be stored in a secret manager.
- Browser sessions and sandbox session identifiers are not ingest credentials.
- The Collector authenticates ingest, overwrites client-supplied project attribution, and keeps projects out of shared batches.
- Internal Collector-to-API traffic uses a separate service secret.
- PostgreSQL and ClickHouse should remain private to the application network.
- Telemetry and user-authored text are untrusted data. They must not be treated as agent instructions or rendered as HTML.
- CORS and origin checks are part of the authorization boundary for cookie-authenticated mutations.

## Deployment guidance

- Replace every value from `.env.example` outside isolated local development.
- Do not expose PostgreSQL, ClickHouse, the payments stub, or the load controller to the public internet.
- Use HTTPS for the console, API, and OTLP/HTTP endpoint.
- Keep the API, Collector, database images, and dependencies pinned and reviewed.
- Back up PostgreSQL and ClickHouse together. Follow `infra/runbooks/backups.md`.
- Keep request, batch, rate, memory, and disk limits enabled.
- Revoke an ingest key immediately if it appears in logs, screenshots, shell history, or source control.

## Known pre-release gaps

The hosted Sites handoff and browser WebMCP registry are implemented but have not completed final deployment testing in ChatGPT and Chrome. Production-scale testing and an independent security review have not been completed. Self-hosted operation is not supported for the hackathon release.
