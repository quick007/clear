# Console

Clear's React interface and WebMCP tool surface. It presents boards, telemetry
exploration, alerts, and incidents while exposing the same investigation
operations to an agent.

The hosted build runs on ChatGPT Sites. Static assets contain the application,
and a thin worker handles Sites identity handoff before forwarding control to
the backend. The worker is not an API proxy.

## Local development

Copy the example environment and start the Vite+ server:

```sh
cp apps/console/.env.example apps/console/.env.local
vp -C apps/console run dev
```

The console listens on `http://localhost:5173` by default. Run the local service
stack described in [`docs/self-hosting.md`](../../docs/self-hosting.md) when the
UI needs live API and telemetry data.

## Configuration

[`apps/console/.env.example`](.env.example) documents browser and worker
configuration. Keep actual origins and secrets in uncommitted environment files
or the hosting provider. [`src/config.ts`](src/config.ts) validates browser
configuration at startup.

`GROUNDTRUTH_API_ORIGIN` is the public browser-facing API origin. Authentication
callbacks and shared-domain cookies depend on it, so it must stay on the public
Clear domain. `GROUNDTRUTH_INTERNAL_API_ORIGIN` is an optional server-to-server
origin used only when the Sites worker creates an identity handoff. When it is
unset, the worker falls back to `GROUNDTRUTH_API_ORIGIN`.

## Key files

- [`src/main.tsx`](src/main.tsx): browser entrypoint.
- [`src/router.tsx`](src/router.tsx): application routes.
- [`src/app/`](src/app): shared application shell and navigation.
- [`src/features/`](src/features): page-level product features.
- [`src/webmcp/`](src/webmcp): tool schemas, registration, and operations.
- [`src/worker.ts`](src/worker.ts): hosted identity handoff and asset worker.

## Validate

```sh
vp -C apps/console run test
vp -C apps/console run build
```
