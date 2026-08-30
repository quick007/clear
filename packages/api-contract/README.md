# API contract

The typed HTTP boundary shared by Clear's backend and browser console. It composes Effect HTTP API groups with request, response, error, security, server-sent event, and canonical OTLP JSON schemas.

`GroundtruthApi` is the public root contract. The backend implements its groups with `HttpApiBuilder`, while the console derives its client from the same definition with `HttpApiClient`. OpenAPI metadata is generated from this contract rather than maintained separately.

## Contract surface

- Public route groups for authentication, alerts, board state, deploy events, health, incidents, ingest keys, project overview, sandbox sessions, telemetry queries, and live events
- A private Collector group for ingest authorization, metrics, logs, traces, and telemetry activity hints
- Middleware contracts for browser sessions, sandbox sessions, ingest keys, the Sites service, and the Collector service
- Typed request and response models, paginated cursors, live event variants, and transport-aware errors
- Bounded canonical OTLP JSON schemas for metrics, logs, and traces

The package defines the transport boundary only. Endpoint handlers and application services live in `apps/backend`; durable business entities and identifiers live in `@groundtruth/domain`.

## Usage

The backend and console both derive types from the same API definition:

```ts
import { GroundtruthApi } from "@groundtruth/api-contract";
import { HttpApiBuilder, HttpApiClient } from "effect/unstable/httpapi";

export type ClearClient = HttpApiClient.ForApi<typeof GroundtruthApi>;

const routes = HttpApiBuilder.layer(GroundtruthApi, {
  openapiPath: "/openapi.json",
});
```

Individual request schemas are also exported for decoding at non-HTTP boundaries:

```ts
import { CreateAlertRequest } from "@groundtruth/api-contract";
import { Schema } from "effect";

const decodeCreateAlert = Schema.decodeUnknownEffect(CreateAlertRequest);
```

## Layout

- `api.ts`: the composed `GroundtruthApi` contract and OpenAPI metadata
- `groups/`: endpoint names, methods, paths, middleware, and status schemas
- `model/`: product request, response, pagination, and event schemas
- `otlp/`: canonical OTLP JSON envelopes and structural complexity limits
- `middleware.ts`: authentication and authorization context contracts
- `errors.ts`: HTTP-specific errors and domain error status mappings
- `index.ts`: the public package surface

## Development

From the repository root:

```sh
vp -C packages/api-contract check
vp -C packages/api-contract run test
vp -C packages/api-contract run build
```
