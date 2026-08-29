import { Schema } from "effect";
import {
  AttributeKey,
  AxisId,
  MetricAggregation,
  MetricName,
  QueryRef,
  QueryStep,
  QueryWindow,
} from "./primitives.ts";
import { SeriesStyle } from "./presentation.ts";

export const AttributeScalar = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]).pipe(
  Schema.annotate({
    identifier: "AttributeScalar",
    description: "A scalar OpenTelemetry attribute value used in a metric filter.",
  }),
);
export type AttributeScalar = typeof AttributeScalar.Type;

export const MatchFilter = Schema.TaggedStruct("match", {
  attribute: AttributeKey,
  operator: Schema.Literals(["eq", "not_eq"]),
  value: AttributeScalar,
}).pipe(
  Schema.annotate({
    identifier: "MatchFilter",
    description: "Matches or excludes one exact attribute value.",
  }),
);
export type MatchFilter = typeof MatchFilter.Type;

export const SetFilter = Schema.TaggedStruct("set", {
  attribute: AttributeKey,
  operator: Schema.Literals(["in", "not_in"]),
  values: Schema.NonEmptyArray(AttributeScalar).check(Schema.isMaxLength(32), Schema.isUnique()),
}).pipe(
  Schema.annotate({
    identifier: "SetFilter",
    description: "Matches or excludes a bounded set of attribute values.",
  }),
);
export type SetFilter = typeof SetFilter.Type;

export const RangeFilter = Schema.TaggedStruct("range", {
  attribute: AttributeKey,
  operator: Schema.Literals(["gt", "gte", "lt", "lte"]),
  value: Schema.Finite,
}).pipe(
  Schema.annotate({
    identifier: "RangeFilter",
    description: "Compares a numeric attribute with a finite bound.",
  }),
);
export type RangeFilter = typeof RangeFilter.Type;

export const PresenceFilter = Schema.TaggedStruct("presence", {
  attribute: AttributeKey,
  exists: Schema.Boolean,
}).pipe(
  Schema.annotate({
    identifier: "PresenceFilter",
    description: "Requires an attribute to be present or absent.",
  }),
);
export type PresenceFilter = typeof PresenceFilter.Type;

export const PatternFilter = Schema.TaggedStruct("pattern", {
  attribute: AttributeKey,
  pattern: Schema.String.check(Schema.isLengthBetween(1, 500)),
  negate: Schema.Boolean,
}).pipe(
  Schema.annotate({
    identifier: "PatternFilter",
    description: "Matches an attribute string with a backend-supported regular expression.",
  }),
);
export type PatternFilter = typeof PatternFilter.Type;

export const MetricFilter = Schema.Union([
  MatchFilter,
  SetFilter,
  RangeFilter,
  PresenceFilter,
  PatternFilter,
]).pipe(
  Schema.annotate({
    identifier: "MetricFilter",
    description: "A typed predicate applied before metric aggregation.",
  }),
);
export type MetricFilter = typeof MetricFilter.Type;

export const GroupBy = Schema.Struct({
  attributes: Schema.NonEmptyArray(AttributeKey).check(Schema.isMaxLength(2), Schema.isUnique()),
  maxSeries: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 })),
  includeOther: Schema.optionalKey(Schema.Boolean),
}).pipe(
  Schema.annotate({
    identifier: "GroupBy",
    description: "Groups a query by at most two attributes and caps rendered cardinality.",
  }),
);
export type GroupBy = typeof GroupBy.Type;

const metricQueryFields = {
  refId: QueryRef,
  metric: MetricName,
  aggregation: MetricAggregation,
  distinctKey: Schema.optionalKey(AttributeKey),
  window: QueryWindow,
  step: Schema.optionalKey(QueryStep),
  filters: Schema.optionalKey(Schema.Array(MetricFilter).check(Schema.isMaxLength(16))),
  groupBy: Schema.optionalKey(GroupBy),
} as const;

const distinctAggregationCheck = <
  T extends {
    readonly aggregation: MetricAggregation;
    readonly distinctKey?: AttributeKey;
  },
>() =>
  Schema.makeFilter<T>((query) => {
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

const MetricQueryBase = Schema.Struct(metricQueryFields);

export const MetricQuery = MetricQueryBase.check(
  distinctAggregationCheck<typeof MetricQueryBase.Type>(),
).pipe(
  Schema.annotate({
    identifier: "MetricQuery",
    description: "A bounded server-side metric query.",
  }),
);
export type MetricQuery = typeof MetricQuery.Type;

const ChartQueryBase = Schema.Struct({
  ...metricQueryFields,
  axis: AxisId,
  style: Schema.optionalKey(SeriesStyle),
});

export const ChartQuery = ChartQueryBase.check(
  distinctAggregationCheck<typeof ChartQueryBase.Type>(),
).pipe(
  Schema.annotate({
    identifier: "ChartQuery",
    description: "A metric query plus its chart-series presentation.",
  }),
);
export type ChartQuery = typeof ChartQuery.Type;
