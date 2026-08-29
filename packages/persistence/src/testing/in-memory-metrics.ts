import {
  MetricAttribute,
  MetricCatalogEntry,
  type MetricPoint,
  type MetricQuery,
  MetricQueryResult,
  MetricQueryStats,
  MetricSeries,
  MetricSeriesPoint,
  type SumPoint,
} from "@groundtruth/telemetry";
import { DateTime, Schema } from "effect";
import {
  inRange,
  matchesFilters,
  recordQueryAttributes,
  relativeWindowMillis,
  valueText,
} from "./in-memory-query-support.ts";

const toDateTime = (unixNano: bigint) => DateTime.makeUnsafe(Number(unixNano / 1_000_000n));

export const listMetrics = (metrics: ReadonlyArray<MetricPoint>) => {
  const byName = Map.groupBy(metrics, ({ name }) => name);
  return [...byName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 500)
    .map(([name, points]) => {
      const first = points[0]!;
      const times = points.map(({ timeUnixNano }) => timeUnixNano);
      const attributeValues = new Map<string, Array<string>>();
      for (const point of points) {
        for (const [key, value] of Object.entries(recordQueryAttributes(point))) {
          const examples = attributeValues.get(key) ?? [];
          const example = valueText(value);
          if (!examples.includes(example) && examples.length < 8) examples.push(example);
          attributeValues.set(key, examples);
        }
      }
      const sum = points.find((point) => point._tag === "sum");
      return new MetricCatalogEntry({
        name,
        description: first.description,
        unit: first.unit,
        metadata: first.metadata,
        type: first._tag,
        temporalities: [
          ...new Set(
            points.flatMap((point) => ("temporality" in point ? [point.temporality] : [])),
          ),
        ],
        monotonic: sum?._tag === "sum" ? sum.monotonic : null,
        services: [...new Set(points.map(({ serviceName }) => serviceName))],
        attributes: [...attributeValues].map(([key, examples]) =>
          Schema.decodeUnknownSync(MetricAttribute)({ key, examples }),
        ),
        firstSeenAt: toDateTime(times.reduce((left, right) => (left < right ? left : right))),
        lastSeenAt: toDateTime(times.reduce((left, right) => (left > right ? left : right))),
      });
    });
};

const stepSeconds = (query: MetricQuery) => {
  if (query.step !== undefined) return { "10s": 10, "30s": 30, "1m": 60, "5m": 300 }[query.step];
  const seconds =
    query.range._tag === "absolute"
      ? (DateTime.toEpochMillis(query.range.end) - DateTime.toEpochMillis(query.range.start)) /
        1_000
      : relativeWindowMillis(query.range.window) / 1_000;
  if (seconds <= 900) return 10;
  if (seconds <= 3_600) return 30;
  if (seconds <= 21_600) return 60;
  return 300;
};

const metricContribution = (point: MetricPoint) => {
  if (point._tag === "gauge" || point._tag === "sum") {
    const value = Number(point.value.value);
    return { value, total: value, count: 1, minimum: value, maximum: value };
  }
  const count = Number(point.count);
  const total = point.sum ?? 0;
  const value = count === 0 ? 0 : total / count;
  const minimum = "minimum" in point ? (point.minimum ?? value) : value;
  const maximum = "maximum" in point ? (point.maximum ?? value) : value;
  return { value, total, count, minimum, maximum };
};

interface MetricBucket {
  readonly at: bigint;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly points: Array<MetricPoint>;
}

const percentile = (values: ReadonlyArray<number>, fraction: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? 0;
};

const aggregateBucket = (bucket: MetricBucket, query: MetricQuery) => {
  if (query.aggregation === "count-distinct") {
    const key = query.distinctKey!;
    return new Set(bucket.points.map((point) => valueText(recordQueryAttributes(point)[key]))).size;
  }
  const contributions = bucket.points.map(metricContribution);
  const values = contributions.map(({ value }) => value);
  if (query.aggregation === "sum") {
    return contributions.reduce((sum, value) => sum + value.total, 0);
  }
  if (query.aggregation === "count") {
    return contributions.reduce((sum, value) => sum + value.count, 0);
  }
  if (query.aggregation === "min") return Math.min(...contributions.map(({ minimum }) => minimum));
  if (query.aggregation === "max") return Math.max(...contributions.map(({ maximum }) => maximum));
  if (query.aggregation === "p50") return percentile(values, 0.5);
  if (query.aggregation === "p95") return percentile(values, 0.95);
  if (query.aggregation === "p99") return percentile(values, 0.99);
  const count = contributions.reduce((sum, value) => sum + value.count, 0);
  return count === 0 ? 0 : contributions.reduce((sum, value) => sum + value.total, 0) / count;
};

const rateContributionByPoint = (points: ReadonlyArray<MetricPoint>) => {
  const contributions = new Map<MetricPoint, number>();
  const isCumulativeSum = (point: MetricPoint): point is SumPoint =>
    point._tag === "sum" && point.temporality === "cumulative";
  const cumulativeStreams = Map.groupBy(points.filter(isCumulativeSum), (point) =>
    valueText({
      serviceName: point.serviceName,
      resource: point.resource,
      scope: point.scope,
      attributes: point.attributes,
      metadata: point.metadata,
    }),
  );
  for (const stream of cumulativeStreams.values()) {
    const ordered = [...stream].sort((left, right) =>
      left.timeUnixNano < right.timeUnixNano ? -1 : left.timeUnixNano > right.timeUnixNano ? 1 : 0,
    );
    for (const [index, point] of ordered.entries()) {
      const previous = ordered[index - 1];
      if (previous === undefined) continue;
      const value = Number(point.value.value);
      const previousValue = Number(previous.value.value);
      const reset =
        point.startTimeUnixNano !== previous.startTimeUnixNano ||
        (point.monotonic && value < previousValue);
      contributions.set(point, reset ? value : value - previousValue);
    }
  }
  for (const point of points) {
    if (
      !contributions.has(point) &&
      !(point._tag === "sum" && point.temporality === "cumulative")
    ) {
      contributions.set(point, metricContribution(point).total);
    }
  }
  return contributions;
};

export const queryMetrics = (
  metrics: ReadonlyArray<MetricPoint>,
  query: MetricQuery,
  nowMillis: number,
) => {
  const seconds = stepSeconds(query);
  const bucketSize = BigInt(seconds) * 1_000_000_000n;
  const groupBy = query.groupBy ?? [];
  const buckets = new Map<string, MetricBucket>();
  const matching = metrics.filter((point) => {
    const attributes = recordQueryAttributes(point);
    return (
      point.name === query.metric &&
      inRange(point.timeUnixNano, query.range, nowMillis) &&
      matchesFilters(attributes, query.filters ?? [])
    );
  });
  const rateContributions = query.aggregation === "rate" ? rateContributionByPoint(matching) : null;
  for (const point of matching) {
    if (rateContributions !== null && !rateContributions.has(point)) continue;
    const queryAttributes = recordQueryAttributes(point);
    const at = (point.timeUnixNano / bucketSize) * bucketSize;
    const attributes = Object.fromEntries(groupBy.map((key) => [key, queryAttributes[key] ?? ""]));
    const key = `${at}:${JSON.stringify(attributes)}`;
    const bucket: MetricBucket = buckets.get(key) ?? { at, attributes, points: [] };
    bucket.points.push(point);
    buckets.set(key, bucket);
  }
  const maxPoints = query.maxPoints ?? 1_000;
  const all = [...buckets.values()].sort((left, right) => (left.at < right.at ? -1 : 1));
  const limited = all.slice(0, maxPoints);
  const bySeries = Map.groupBy(limited, ({ attributes }) => JSON.stringify(attributes));
  const maxSeries = query.maxSeries ?? 20;
  const series = [...bySeries.entries()].slice(0, maxSeries).map(([, grouped]) => {
    const attributes = grouped[0]?.attributes ?? {};
    const label =
      Object.entries(attributes)
        .map(([key, value]) => `${key}=${valueText(value)}`)
        .join(", ") || query.metric;
    return new MetricSeries({
      label,
      attributes,
      points: grouped.map(
        (bucket) =>
          new MetricSeriesPoint({
            at: toDateTime(bucket.at),
            value:
              rateContributions === null
                ? aggregateBucket(bucket, query)
                : bucket.points.reduce(
                    (total, point) => total + (rateContributions.get(point) ?? 0),
                    0,
                  ) / seconds,
          }),
      ),
    });
  });
  const values = series.flatMap(({ points }) => points.map(({ value }) => value));
  const sum = values.reduce((total, value) => total + value, 0);
  const partial = all.length > maxPoints || bySeries.size > maxSeries;
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
    hint: partial ? "The in-memory result was truncated by query bounds." : null,
  });
};
