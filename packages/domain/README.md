# Domain

Canonical Effect schemas for Clear's durable business values. This package gives the backend, persistence layer, API contract, and console one runtime-validated model instead of parallel TypeScript-only types.

## What lives here

- Branded UUIDv7 identifiers for users, projects, dashboards, panels, incidents, alerts, hypotheses, timeline entries, deploy events, sessions, and ingest keys
- Constrained primitives such as project slugs, service names, commit SHAs, URLs, and status literals
- Domain records for accounts, projects, dashboards, panels, ingest keys, services, alerts, incidents, hypotheses, and deploy events
- Tagged unions for hosted and sandbox sessions, incident timeline entries, and domain errors

HTTP paths, request payloads, response views, and transport status codes belong in `@groundtruth/api-contract`. Database records and repository implementations belong in `@groundtruth/persistence`.

## Usage

Schemas provide both runtime decoding and their inferred TypeScript types:

```ts
import { ProjectId, ProjectSlug, type TimelineEntry } from "@groundtruth/domain";
import { Effect, Schema } from "effect";

const decodeProject = (id: unknown, slug: unknown) =>
  Effect.all({
    id: Schema.decodeUnknownEffect(ProjectId)(id),
    slug: Schema.decodeUnknownEffect(ProjectSlug)(slug),
  });

const summarizeTimelineEntry = (entry: TimelineEntry) => {
  switch (entry._tag) {
    case "note":
      return entry.text;
    case "hypothesis":
      return `${entry.status}: ${entry.text}`;
    case "deploy":
      return `${entry.serviceName} deployed ${entry.sha}`;
    case "incident-status":
      return entry.status;
  }
};
```

## Layout

- `accounts.ts`, `projects.ts`, and `services.ts`: durable product records
- `alerts.ts` and `incidents.ts`: investigation state and timeline variants
- `ids.ts` and `primitives.ts`: reusable branded values and literal states
- `sessions.ts`: hosted and sandbox session variants
- `errors.ts`: tagged failures shared across application layers
- `index.ts`: the public package surface

## Development

From the repository root:

```sh
vp -C packages/domain check
vp -C packages/domain run test
vp -C packages/domain run build
```
