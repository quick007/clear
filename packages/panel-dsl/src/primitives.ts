import { Schema } from "effect";

const boundedText = (identifier: string, maximum: number, description: string) =>
  Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, maximum)).pipe(
    Schema.annotate({ identifier, description }),
  );

export const PanelTitle = boundedText(
  "PanelTitle",
  120,
  "A concise title displayed in the panel header.",
).pipe(Schema.brand("PanelTitle"));
export type PanelTitle = typeof PanelTitle.Type;

export const PanelDescription = boundedText(
  "PanelDescription",
  1_000,
  "Optional context explaining what the panel is intended to show.",
).pipe(Schema.brand("PanelDescription"));
export type PanelDescription = typeof PanelDescription.Type;

export const MetricName = Schema.String.check(
  Schema.isLengthBetween(1, 255),
  Schema.isPattern(/^[A-Za-z][A-Za-z0-9._/-]*$/),
).pipe(
  Schema.brand("MetricName"),
  Schema.annotate({
    identifier: "MetricName",
    description: "An OpenTelemetry metric instrument name.",
  }),
);
export type MetricName = typeof MetricName.Type;

export const AttributeKey = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isLengthBetween(1, 255),
).pipe(
  Schema.brand("AttributeKey"),
  Schema.annotate({
    identifier: "AttributeKey",
    description: "An OpenTelemetry resource or data-point attribute key.",
  }),
);
export type AttributeKey = typeof AttributeKey.Type;

export const QueryRef = Schema.String.check(Schema.isPattern(/^[A-Z][A-Z0-9_]{0,15}$/)).pipe(
  Schema.brand("QueryRef"),
  Schema.annotate({
    identifier: "QueryRef",
    description: "A panel-local query identifier such as A, B, or RETRIES.",
  }),
);
export type QueryRef = typeof QueryRef.Type;

export const ColumnId = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9_-]{0,31}$/)).pipe(
  Schema.brand("ColumnId"),
  Schema.annotate({
    identifier: "ColumnId",
    description: "A panel-local table column identifier.",
  }),
);
export type ColumnId = typeof ColumnId.Type;

export const Label = boundedText("PanelLabel", 160, "A short human-readable label.").pipe(
  Schema.brand("PanelLabel"),
);
export type Label = typeof Label.Type;

export const MetricAggregation = Schema.Literals([
  "sum",
  "avg",
  "min",
  "max",
  "count",
  "rate",
  "p50",
  "p95",
  "p99",
  "count-distinct",
]).pipe(
  Schema.annotate({
    identifier: "MetricAggregation",
    description: "The server-side aggregation applied to metric points.",
  }),
);
export type MetricAggregation = typeof MetricAggregation.Type;

export const QueryWindow = Schema.Literals(["15m", "1h", "3h", "6h", "12h", "24h", "7d"]).pipe(
  Schema.annotate({
    identifier: "QueryWindow",
    description: "A bounded lookback window ending at the panel evaluation time.",
  }),
);
export type QueryWindow = typeof QueryWindow.Type;

export const QueryStep = Schema.Literals(["auto", "10s", "30s", "1m", "5m", "15m"]).pipe(
  Schema.annotate({
    identifier: "QueryStep",
    description: "The target resolution for server-side downsampling.",
  }),
);
export type QueryStep = typeof QueryStep.Type;

export const AxisId = Schema.Literals(["left", "right"]).pipe(
  Schema.annotate({
    identifier: "AxisId",
    description: "The vertical axis used to render a chart query.",
  }),
);
export type AxisId = typeof AxisId.Type;

export const PaletteColor = Schema.Literals([
  "blue",
  "cyan",
  "green",
  "amber",
  "orange",
  "red",
  "violet",
  "gray",
]).pipe(
  Schema.annotate({
    identifier: "PaletteColor",
    description: "A semantic color token from the Clear chart palette.",
  }),
);
export type PaletteColor = typeof PaletteColor.Type;

export const SafeTimestampMs = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
).pipe(
  Schema.annotate({
    identifier: "SafeTimestampMs",
    description: "A Unix timestamp in milliseconds represented as a safe integer.",
  }),
);
export type SafeTimestampMs = typeof SafeTimestampMs.Type;

export const SchemaVersion = Schema.Literal(1).pipe(
  Schema.annotate({
    identifier: "PanelSchemaVersion",
    description: "The panel DSL schema version.",
  }),
);
export type SchemaVersion = typeof SchemaVersion.Type;
