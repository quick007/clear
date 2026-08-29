import { Schema } from "effect";
import {
  OtlpInstrumentationScope,
  OtlpInt64,
  OtlpKeyValue,
  OtlpResource,
  OtlpSpanId,
  OtlpTraceId,
  OtlpUint64,
} from "./common.ts";
import { withOtlpStructureBudget } from "./complexity.ts";

export const OtlpAggregationTemporality = Schema.Literals([0, 1, 2]);

export const OtlpExemplar = Schema.Struct({
  filteredAttributes: Schema.optional(Schema.Array(OtlpKeyValue)),
  timeUnixNano: Schema.optional(OtlpUint64),
  asDouble: Schema.optional(Schema.Finite),
  asInt: Schema.optional(OtlpInt64),
  spanId: Schema.optional(OtlpSpanId),
  traceId: Schema.optional(OtlpTraceId),
});

export const OtlpNumberDataPoint = Schema.Struct({
  attributes: Schema.optional(Schema.Array(OtlpKeyValue)),
  startTimeUnixNano: Schema.optional(OtlpUint64),
  timeUnixNano: Schema.optional(OtlpUint64),
  asDouble: Schema.optional(Schema.Finite),
  asInt: Schema.optional(OtlpInt64),
  exemplars: Schema.optional(Schema.Array(OtlpExemplar)),
  flags: Schema.optional(Schema.Natural),
});

export const OtlpHistogramDataPoint = Schema.Struct({
  attributes: Schema.optional(Schema.Array(OtlpKeyValue)),
  startTimeUnixNano: Schema.optional(OtlpUint64),
  timeUnixNano: Schema.optional(OtlpUint64),
  count: Schema.optional(OtlpUint64),
  sum: Schema.optional(Schema.Finite),
  bucketCounts: Schema.optional(Schema.Array(OtlpUint64)),
  explicitBounds: Schema.optional(Schema.Array(Schema.Finite)),
  exemplars: Schema.optional(Schema.Array(OtlpExemplar)),
  flags: Schema.optional(Schema.Natural),
  min: Schema.optional(Schema.Finite),
  max: Schema.optional(Schema.Finite),
});

export const OtlpExponentialBuckets = Schema.Struct({
  offset: Schema.optional(Schema.Int),
  bucketCounts: Schema.optional(Schema.Array(OtlpUint64)),
});

export const OtlpExponentialHistogramDataPoint = Schema.Struct({
  attributes: Schema.optional(Schema.Array(OtlpKeyValue)),
  startTimeUnixNano: Schema.optional(OtlpUint64),
  timeUnixNano: Schema.optional(OtlpUint64),
  count: Schema.optional(OtlpUint64),
  sum: Schema.optional(Schema.Finite),
  scale: Schema.optional(Schema.Int),
  zeroCount: Schema.optional(OtlpUint64),
  positive: Schema.optional(OtlpExponentialBuckets),
  negative: Schema.optional(OtlpExponentialBuckets),
  flags: Schema.optional(Schema.Natural),
  exemplars: Schema.optional(Schema.Array(OtlpExemplar)),
  min: Schema.optional(Schema.Finite),
  max: Schema.optional(Schema.Finite),
  zeroThreshold: Schema.optional(Schema.Finite),
});

export const OtlpValueAtQuantile = Schema.Struct({
  quantile: Schema.optional(Schema.Finite),
  value: Schema.optional(Schema.Finite),
});

export const OtlpSummaryDataPoint = Schema.Struct({
  attributes: Schema.optional(Schema.Array(OtlpKeyValue)),
  startTimeUnixNano: Schema.optional(OtlpUint64),
  timeUnixNano: Schema.optional(OtlpUint64),
  count: Schema.optional(OtlpUint64),
  sum: Schema.optional(Schema.Finite),
  quantileValues: Schema.optional(Schema.Array(OtlpValueAtQuantile)),
  flags: Schema.optional(Schema.Natural),
});

export const OtlpGauge = Schema.Struct({
  dataPoints: Schema.optional(Schema.Array(OtlpNumberDataPoint)),
});

export const OtlpSum = Schema.Struct({
  dataPoints: Schema.optional(Schema.Array(OtlpNumberDataPoint)),
  aggregationTemporality: Schema.optional(OtlpAggregationTemporality),
  isMonotonic: Schema.optional(Schema.Boolean),
});

export const OtlpHistogram = Schema.Struct({
  dataPoints: Schema.optional(Schema.Array(OtlpHistogramDataPoint)),
  aggregationTemporality: Schema.optional(OtlpAggregationTemporality),
});

export const OtlpExponentialHistogram = Schema.Struct({
  dataPoints: Schema.optional(Schema.Array(OtlpExponentialHistogramDataPoint)),
  aggregationTemporality: Schema.optional(OtlpAggregationTemporality),
});

export const OtlpSummary = Schema.Struct({
  dataPoints: Schema.optional(Schema.Array(OtlpSummaryDataPoint)),
});

export const OtlpMetric = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  unit: Schema.optional(Schema.String),
  gauge: Schema.optional(OtlpGauge),
  sum: Schema.optional(OtlpSum),
  histogram: Schema.optional(OtlpHistogram),
  exponentialHistogram: Schema.optional(OtlpExponentialHistogram),
  summary: Schema.optional(OtlpSummary),
  metadata: Schema.optional(Schema.Array(OtlpKeyValue)),
});

export const OtlpScopeMetrics = Schema.Struct({
  scope: Schema.optional(OtlpInstrumentationScope),
  metrics: Schema.optional(Schema.Array(OtlpMetric)),
  schemaUrl: Schema.optional(Schema.String),
});

export const OtlpResourceMetrics = Schema.Struct({
  resource: Schema.optional(OtlpResource),
  scopeMetrics: Schema.optional(Schema.Array(OtlpScopeMetrics)),
  schemaUrl: Schema.optional(Schema.String),
});

export class OtlpMetricsRequest extends Schema.Class<OtlpMetricsRequest>(
  "Groundtruth/OtlpMetricsRequest",
)({
  resourceMetrics: Schema.optional(Schema.Array(OtlpResourceMetrics)),
}) {}

export const OtlpMetricsPayload = withOtlpStructureBudget(OtlpMetricsRequest);
