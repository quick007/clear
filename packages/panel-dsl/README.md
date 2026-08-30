# Panel DSL

The shared, versioned contract for panels on a Clear board. It uses Effect Schema to validate both the telemetry query and the presentation details before a panel reaches the API, persistence layer, or console.

This package defines panel specifications. It does not execute metric queries or render charts.

## Public surface

- `PanelSpec`: the union of metric chart, stat, and table panels
- `MetricQuery` and `ChartQuery`: bounded metric queries with typed filters and grouping
- Presentation schemas for axes, units, thresholds, legends, series styles, and annotations
- Branded primitives for metric names, attribute keys, query references, column IDs, and labels
- `PanelSpecJsonSchema`: a closed JSON Schema document for WebMCP and other JSON consumers
- `GoldenPanels`: validated examples used by the retry-amplification investigation

The schemas enforce cross-field invariants such as unique query references, declared axes, valid table references, heatmap query count, and the required `distinctKey` for `count-distinct` queries.

## Decode a panel

Treat panel input as unknown at system boundaries and decode it with Effect Schema:

```ts
import { PanelSpec } from "@groundtruth/panel-dsl";
import { Effect, Schema } from "effect";

const decodePanel = Schema.decodeUnknownEffect(PanelSpec);

const panel = await Effect.runPromise(
  decodePanel({
    _tag: "stat",
    version: 1,
    title: "Checkout p95 latency",
    query: {
      refId: "LATENCY",
      metric: "http.server.duration",
      aggregation: "p95",
      window: "1h",
    },
    reduction: "last",
    unit: { _tag: "duration", input: "ms", display: "auto" },
    sparkline: true,
  }),
);
```

`PanelSpecJsonSchema` is derived from the same Effect schemas, so the JSON contract stays aligned with runtime validation.

## Development

From the repository root:

```sh
vp -C packages/panel-dsl check
vp -C packages/panel-dsl run test
vp -C packages/panel-dsl run build
```
