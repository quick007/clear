import { Schema } from "effect";
import {
  AttributeFilter,
  AttributeKey,
  InstrumentationScope,
  MetricName,
  OtelFlags,
  QueryStep,
  ResourceContext,
  ServiceName,
  SignedInt64,
  SpanId,
  TelemetryAttributes,
  TimeRange,
  TraceId,
  UnixNano,
  UnsignedCount,
} from "./primitives.ts";

export const MetricType = Schema.Literals([
  "gauge",
  "sum",
  "histogram",
  "exponential-histogram",
  "summary",
]);
export type MetricType = typeof MetricType.Type;

export const MetricTemporality = Schema.Literals(["unspecified", "delta", "cumulative"]);
export type MetricTemporality = typeof MetricTemporality.Type;

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
]);
export type MetricAggregation = typeof MetricAggregation.Type;

export class IntegerMetricValue extends Schema.TaggedClass<IntegerMetricValue>(
  "Groundtruth/Telemetry/IntegerMetricValue",
)("int", {
  value: SignedInt64,
}) {}

export class DoubleMetricValue extends Schema.TaggedClass<DoubleMetricValue>(
  "Groundtruth/Telemetry/DoubleMetricValue",
)("double", {
  value: Schema.Finite,
}) {}

export const MetricNumberValue = Schema.Union([IntegerMetricValue, DoubleMetricValue]).pipe(
  Schema.toTaggedUnion("_tag"),
);
export type MetricNumberValue = typeof MetricNumberValue.Type;

export class MetricAttribute extends Schema.Class<MetricAttribute>(
  "Groundtruth/Telemetry/MetricAttribute",
)({
  key: AttributeKey,
  examples: Schema.Array(Schema.String).check(Schema.isMaxLength(8)),
}) {}

export class MetricCatalogEntry extends Schema.Class<MetricCatalogEntry>(
  "Groundtruth/Telemetry/MetricCatalogEntry",
)({
  name: MetricName,
  description: Schema.String,
  unit: Schema.String,
  metadata: TelemetryAttributes,
  type: MetricType,
  temporalities: Schema.Array(MetricTemporality).check(Schema.isUnique()),
  monotonic: Schema.NullOr(Schema.Boolean),
  services: Schema.Array(ServiceName).check(Schema.isUnique()),
  attributes: Schema.Array(MetricAttribute),
  firstSeenAt: Schema.DateTimeUtcFromString,
  lastSeenAt: Schema.DateTimeUtcFromString,
}) {}

const metricQueryFields = {
  metric: MetricName,
  aggregation: MetricAggregation,
  distinctKey: Schema.optional(AttributeKey),
  range: TimeRange,
  step: Schema.optional(QueryStep),
  filters: Schema.optional(Schema.Array(AttributeFilter).check(Schema.isMaxLength(16))),
  groupBy: Schema.optional(
    Schema.Array(AttributeKey).check(Schema.isMaxLength(2), Schema.isUnique()),
  ),
  maxSeries: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 32 }))),
  maxPoints: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2_000 }))),
} as const;

const distinctAggregationCheck = <
  Query extends {
    readonly aggregation: MetricAggregation;
    readonly distinctKey?: AttributeKey;
  },
>() =>
  Schema.makeFilter<Query>((query) => {
    if (query.aggregation === "count-distinct" && query.distinctKey === undefined) {
      return {
        path: ["distinctKey"],
        issue: "count-distinct queries must name the attribute to count",
      };
    }
    if (query.aggregation !== "count-distinct" && query.distinctKey !== undefined) {
      return {
        path: ["distinctKey"],
        issue: "distinctKey is supported only by count-distinct queries",
      };
    }
    return undefined;
  });

const MetricQueryStruct = Schema.Struct(metricQueryFields);

const MetricQuerySchema = MetricQueryStruct.check(
  distinctAggregationCheck<typeof MetricQueryStruct.Type>(),
);

export class MetricQuery extends Schema.Class<MetricQuery>("Groundtruth/Telemetry/MetricQuery")(
  MetricQuerySchema,
) {}

const MetricAggregateQueryStruct = Schema.Struct({
  metric: MetricName,
  aggregation: MetricAggregation,
  distinctKey: Schema.optional(AttributeKey),
  range: TimeRange,
  filters: Schema.optional(Schema.Array(AttributeFilter).check(Schema.isMaxLength(16))),
});

const MetricAggregateQuerySchema = MetricAggregateQueryStruct.check(
  distinctAggregationCheck<typeof MetricAggregateQueryStruct.Type>(),
);

export class MetricAggregateQuery extends Schema.Class<MetricAggregateQuery>(
  "Groundtruth/Telemetry/MetricAggregateQuery",
)(MetricAggregateQuerySchema) {}

export class MetricAggregateResult extends Schema.Class<MetricAggregateResult>(
  "Groundtruth/Telemetry/MetricAggregateResult",
)({
  value: Schema.NullOr(Schema.Finite),
  matchedPoints: Schema.Natural,
}) {}

export class MetricSeriesPoint extends Schema.Class<MetricSeriesPoint>(
  "Groundtruth/Telemetry/MetricSeriesPoint",
)({
  at: Schema.DateTimeUtcFromString,
  value: Schema.Finite,
}) {}

export class MetricSeries extends Schema.Class<MetricSeries>("Groundtruth/Telemetry/MetricSeries")({
  label: Schema.String,
  attributes: TelemetryAttributes,
  points: Schema.Array(MetricSeriesPoint),
}) {}

export class MetricQueryStats extends Schema.Class<MetricQueryStats>(
  "Groundtruth/Telemetry/MetricQueryStats",
)({
  minimum: Schema.NullOr(Schema.Finite),
  maximum: Schema.NullOr(Schema.Finite),
  average: Schema.NullOr(Schema.Finite),
  sum: Schema.NullOr(Schema.Finite),
  count: Schema.Natural,
  last: Schema.NullOr(Schema.Finite),
}) {}

export class MetricQueryResult extends Schema.Class<MetricQueryResult>(
  "Groundtruth/Telemetry/MetricQueryResult",
)({
  query: MetricQuery,
  series: Schema.Array(MetricSeries),
  stats: MetricQueryStats,
  pointCount: Schema.Natural,
  partial: Schema.Boolean,
  hint: Schema.NullOr(Schema.String),
}) {}

export class Exemplar extends Schema.Class<Exemplar>("Groundtruth/Telemetry/Exemplar")({
  timeUnixNano: UnixNano,
  value: MetricNumberValue,
  filteredAttributes: TelemetryAttributes,
  traceId: Schema.NullOr(TraceId),
  spanId: Schema.NullOr(SpanId),
}) {}

const metricPointBase = {
  name: MetricName,
  description: Schema.String,
  unit: Schema.String,
  metadata: TelemetryAttributes,
  resource: ResourceContext,
  scope: InstrumentationScope,
  serviceName: ServiceName,
  startTimeUnixNano: Schema.NullOr(UnixNano),
  timeUnixNano: UnixNano,
  attributes: TelemetryAttributes,
  exemplars: Schema.Array(Exemplar),
  flags: OtelFlags,
} as const;

export class GaugePoint extends Schema.TaggedClass<GaugePoint>("Groundtruth/Telemetry/GaugePoint")(
  "gauge",
  {
    ...metricPointBase,
    value: MetricNumberValue,
  },
) {}

export class SumPoint extends Schema.TaggedClass<SumPoint>("Groundtruth/Telemetry/SumPoint")(
  "sum",
  {
    ...metricPointBase,
    value: MetricNumberValue,
    temporality: MetricTemporality,
    monotonic: Schema.Boolean,
  },
) {}

export class HistogramPoint extends Schema.TaggedClass<HistogramPoint>(
  "Groundtruth/Telemetry/HistogramPoint",
)("histogram", {
  ...metricPointBase,
  temporality: MetricTemporality,
  count: UnsignedCount,
  sum: Schema.NullOr(Schema.Finite),
  minimum: Schema.NullOr(Schema.Finite),
  maximum: Schema.NullOr(Schema.Finite),
  explicitBounds: Schema.Array(Schema.Finite),
  bucketCounts: Schema.Array(UnsignedCount),
}) {}

export class ExponentialBuckets extends Schema.Class<ExponentialBuckets>(
  "Groundtruth/Telemetry/ExponentialBuckets",
)({
  offset: Schema.Int,
  bucketCounts: Schema.Array(UnsignedCount),
}) {}

export class ExponentialHistogramPoint extends Schema.TaggedClass<ExponentialHistogramPoint>(
  "Groundtruth/Telemetry/ExponentialHistogramPoint",
)("exponential-histogram", {
  ...metricPointBase,
  temporality: MetricTemporality,
  count: UnsignedCount,
  sum: Schema.NullOr(Schema.Finite),
  minimum: Schema.NullOr(Schema.Finite),
  maximum: Schema.NullOr(Schema.Finite),
  scale: Schema.Int,
  zeroCount: UnsignedCount,
  zeroThreshold: Schema.Finite,
  positive: ExponentialBuckets,
  negative: ExponentialBuckets,
}) {}

export class QuantileValue extends Schema.Class<QuantileValue>(
  "Groundtruth/Telemetry/QuantileValue",
)({
  quantile: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  value: Schema.Finite,
}) {}

export class SummaryPoint extends Schema.TaggedClass<SummaryPoint>(
  "Groundtruth/Telemetry/SummaryPoint",
)("summary", {
  ...metricPointBase,
  count: UnsignedCount,
  sum: Schema.Finite,
  quantiles: Schema.Array(QuantileValue),
}) {}

export const MetricPoint = Schema.Union([
  GaugePoint,
  SumPoint,
  HistogramPoint,
  ExponentialHistogramPoint,
  SummaryPoint,
]).pipe(Schema.toTaggedUnion("_tag"));
export type MetricPoint = typeof MetricPoint.Type;
