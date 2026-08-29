import {
  type MetricQuery,
  MetricQueryResult,
  MetricQueryStats,
  MetricSeries,
  MetricSeriesPoint,
} from "@groundtruth/telemetry";
import { DateTime } from "effect";

export interface MetricQueryRow {
  readonly at: string;
  readonly group_0: string;
  readonly group_1: string;
  readonly value: string;
}

export const buildMetricQueryResult = (
  query: MetricQuery,
  rows: ReadonlyArray<MetricQueryRow>,
  maxPoints: number,
  maxSeries: number,
) => {
  const groupBy = query.groupBy ?? [];
  const bySeries = new Map<string, Array<MetricSeriesPoint>>();
  const attributesBySeries = new Map<string, Record<string, string>>();
  for (const row of rows.slice(0, maxPoints)) {
    const attributes = Object.fromEntries(
      groupBy.map((key, index) => [key, index === 0 ? row.group_0 : row.group_1]),
    );
    const key = JSON.stringify(attributes);
    const points = bySeries.get(key) ?? [];
    points.push(
      new MetricSeriesPoint({ at: DateTime.makeUnsafe(row.at), value: Number(row.value) }),
    );
    bySeries.set(key, points);
    attributesBySeries.set(key, attributes);
  }
  const allSeries = [...bySeries.entries()];
  const series = allSeries.slice(0, maxSeries).map(([key, points]) => {
    const attributes = attributesBySeries.get(key) ?? {};
    const label =
      Object.entries(attributes)
        .map(([name, value]) => `${name}=${value}`)
        .join(", ") || query.metric;
    return new MetricSeries({ label, attributes, points });
  });
  const values = series.flatMap(({ points }) => points.map(({ value }) => value));
  const sum = values.reduce((total, value) => total + value, 0);
  const partial = rows.length > maxPoints || allSeries.length > maxSeries;
  return new MetricQueryResult({
    query,
    series,
    stats: new MetricQueryStats({
      minimum: values.length === 0 ? null : Math.min(...values),
      maximum: values.length === 0 ? null : Math.max(...values),
      average: values.length === 0 ? null : sum / values.length,
      sum: values.length === 0 ? null : sum,
      count: values.length,
      last: values.at(-1) ?? null,
    }),
    pointCount: values.length,
    partial,
    hint: partial ? "Narrow the time range or reduce grouping to return every point." : null,
  });
};
