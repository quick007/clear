# Contributing to Clear

Clear is early software with a broad surface area. Focused bug reports, tests, documentation fixes, and small implementation pull requests are welcome.

## Before starting

Open an issue before a large change so the architecture and product boundary are clear. Clear is an observability product, not an execution platform. Changes that add deployment credentials, repository access, merge controls, or infrastructure actions are outside its scope.

Please do not use real customer telemetry, credentials, or production exports in issues, tests, screenshots, or pull requests.

## Development setup

Requirements:

- Node.js 24 or newer
- Vite+ 0.3.x
- Docker Engine with Compose v2 for storage and integration work
- Go 1.25 or newer when changing `apps/collector`

Install the workspace:

```sh
vp install
```

Run the main validation gate:

```sh
vp run ready
```

Run the console:

```sh
vp dev
```

Run the local infrastructure:

```sh
cp .env.example .env
docker compose -f infra/compose.yaml up --build
```

Collector-specific checks live in `apps/collector`:

```sh
cd apps/collector
make test
make validate
make integration
```

## Code expectations

- Use Vite+ commands (`vp`), not npm or pnpm commands.
- Keep Effect Schema as the source of truth for domain and API validation.
- Lean into the pinned Effect v4 APIs instead of wrapping ordinary promise code in a thin Effect shell.
- Prefer inferred types. Do not use `any` to cross a boundary.
- Prefer Drizzle relational queries (`db.query`) for PostgreSQL reads when the query fits that API.
- Keep files under 500 lines when practical.
- Use StyleX for console styling, Base UI for primitives, and Hugeicons for icons.
- Preserve project isolation in every storage query and ingest path.
- Treat logs, traces, attributes, annotations, and other external text as untrusted data.
- Add a readable comment beside non-obvious durations and limits.

## Tests

Add the smallest test that proves the behavior at the right boundary:

- Effect schema and service tests for domain behavior
- API contract tests for route and serialization changes
- repository integration tests for PostgreSQL or ClickHouse changes
- Collector integration tests for protocol and isolation behavior
- browser tests for console and WebMCP behavior

Do not weaken a limit, skip an authorization check, or replace an integration test with a mock just to make a change pass.

## Pull requests

Keep pull requests focused and explain:

1. What changes for a user or operator.
2. Why the change belongs in Clear.
3. How it was verified.
4. Any migration, compatibility, or security effect.

Draft pull requests are welcome. A pull request is ready for review when the relevant tests pass, documentation is current, and it contains no secrets or generated local data.

By contributing, you agree that your contribution is licensed under the repository's [MIT License](LICENSE).
