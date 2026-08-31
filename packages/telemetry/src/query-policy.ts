import { DateTime } from "effect";
import type { MetricQuery } from "./metrics.ts";
import type { TimeRange } from "./primitives.ts";

export const rawMetricRetentionSeconds = 24 * 60 * 60; // 24 hours
export const maximumMetricQuerySeconds = 7 * 24 * 60 * 60; // 7 days

const relativeWindowSeconds = {
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
  "3h": 10_800,
  "6h": 21_600,
  "12h": 43_200,
  "24h": rawMetricRetentionSeconds,
  "7d": maximumMetricQuerySeconds,
} as const;

export const metricRangeDurationSeconds = (range: TimeRange) =>
  range._tag === "relative"
    ? relativeWindowSeconds[range.window]
    : (DateTime.toEpochMillis(range.end) - DateTime.toEpochMillis(range.start)) / 1_000;

export const metricQueryDurationSeconds = (query: MetricQuery) =>
  metricRangeDurationSeconds(query.range);

export const metricQueryUsesRollups = (query: MetricQuery) =>
  metricQueryDurationSeconds(query) > rawMetricRetentionSeconds;

export const metricQuerySupportsRollups = (query: MetricQuery) => {
  const groupBySupported = (query.groupBy ?? []).every((key) => key === "service.name");
  const filtersSupported = (query.filters ?? []).every((filter) => filter.key === "service.name");
  return (
    groupBySupported &&
    filtersSupported &&
    query.aggregation !== "rate" &&
    query.aggregation !== "count-distinct"
  );
};
