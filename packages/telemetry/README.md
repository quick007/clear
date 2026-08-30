# Telemetry

The canonical telemetry contracts shared by Clear's collector boundary, storage adapters, API, and console. The package models OpenTelemetry metrics, logs, and traces with Effect Schema while preserving values that JavaScript cannot represent safely as ordinary numbers.

This package defines data and query contracts. It does not receive OTLP traffic, store telemetry, or execute queries.

## Public surface

- Canonical metric points for gauges, sums, histograms, exponential histograms, and summaries
- Structured log records and paginated log search contracts
- Span records, trace search results, trace trees, correlated logs, and service edges
- `CanonicalTelemetryBatch`, the normalized ingest boundary for all three signals
- Metric catalog, query, series, statistics, and result models
- Shared identifiers, attributes, relative and absolute time ranges, and cursors
- Signal activity and health models
- Tagged query errors for missing data, broad queries, and unavailable telemetry
- Query policy helpers for raw retention and metric rollup eligibility

OTLP nanosecond timestamps and 64-bit integer values decode from strings to `bigint`. Binary attribute values decode from base64 through `TelemetryBytes`. Recursive structured values remain typed through `TelemetryValue`.

## Decode a query

Decode untrusted API or tool input before passing it to a query implementation:

```ts
import { MetricQuery } from "@groundtruth/telemetry";
import { Effect, Schema } from "effect";

const query = await Effect.runPromise(
  Schema.decodeUnknownEffect(MetricQuery)({
    metric: "http.server.requests",
    aggregation: "rate",
    range: { _tag: "relative", window: "15m" },
    filters: [{ key: "service.name", operator: "equals", value: "checkout-api" }],
    groupBy: ["retry"],
    maxSeries: 8,
    maxPoints: 900,
  }),
);
```

Queries beyond the 24-hour raw metric window use rollups only when `metricQuerySupportsRollups` accepts their filters, grouping, and aggregation. The maximum modeled metric window is seven days.

## Development

From the repository root:

```sh
vp -C packages/telemetry check
vp -C packages/telemetry run test
vp -C packages/telemetry run build
```
