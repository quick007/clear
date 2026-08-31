import {
  AttributeKey,
  MetricAttribute,
  MetricCatalogEntry,
  MetricNotFound,
  type MetricPoint,
  type MetricQuery,
  MetricQueryResult,
  MetricQueryStats,
  MetricSeries,
  MetricSeriesPoint,
  QueryTooBroad,
  type SumPoint,
  type TelemetryAttributes,
} from "@groundtruth/telemetry";
import { DateTime, Effect } from "effect";
import {
  combinedAttributes,
  matchesFilters,
  nanosToMillis,
  renderValue,
  timeBounds,
} from "./QuerySupport.js";

const stepMillis = {
  "5s": 5 * 1_000,
  "10s": 10 * 1_000,
  "30s": 30 * 1_000,
  "1m": 60 * 1_000,
  "5m": 5 * 60 * 1_000,
} as const;

const numberValue = (point: MetricPoint) => {
  if (point._tag !== "gauge" && point._tag !== "sum") return null;
  const value = point.value._tag === "double" ? point.value.value : Number(point.value.value);
  return Number.isFinite(value) ? value : null;
};

const pointValue = (point: MetricPoint, aggregation: MetricQuery["aggregation"]) => {
  const numeric = numberValue(point);
  if (aggregation === "count") {
    if (
      point._tag === "histogram" ||
      point._tag === "exponential-histogram" ||
      point._tag === "summary"
    ) {
      return Number(point.count);
    }
    return 1;
  }
  if (aggregation === "sum") {
    if (point._tag === "histogram" || point._tag === "exponential-histogram") return point.sum;
    if (point._tag === "summary") return point.sum;
  }
  if (aggregation === "avg") {
    if (point._tag === "histogram" || point._tag === "exponential-histogram") {
      return point.sum === null || point.count === 0n ? null : point.sum / Number(point.count);
    }
    if (point._tag === "summary")
      return point.count === 0n ? null : point.sum / Number(point.count);
  }
  if (
    aggregation === "min" &&
    (point._tag === "histogram" || point._tag === "exponential-histogram")
  ) {
    return point.minimum;
  }
  if (
    aggregation === "max" &&
    (point._tag === "histogram" || point._tag === "exponential-histogram")
  ) {
    return point.maximum;
  }
  return numeric;
};

interface WeightedValue {
  readonly value: number;
  readonly weight: number;
}

const weightedPercentile = (points: ReadonlyArray<MetricPoint>, target: number) => {
  const weighted = points.flatMap<WeightedValue>((point) => {
    if (point._tag === "histogram") {
      const fallback =
        point.maximum ??
        (point.sum === null || point.count === 0n ? null : point.sum / Number(point.count));
      return point.bucketCounts.flatMap((count, index) => {
        const weight = Number(count);
        const value = point.explicitBounds[index] ?? fallback;
        return value === null || weight <= 0 || !Number.isFinite(weight) ? [] : [{ value, weight }];
      });
    }
    if (point._tag === "summary") {
      const closest = point.quantiles.reduce<
        { readonly distance: number; readonly value: number } | undefined
      >((current, item) => {
        const distance = Math.abs(item.quantile - target);
        return current === undefined || distance < current.distance
          ? { distance, value: item.value }
          : current;
      }, undefined);
      const weight = Number(point.count);
      return closest === undefined || weight <= 0 || !Number.isFinite(weight)
        ? []
        : [{ value: closest.value, weight }];
    }
    if (point._tag === "exponential-histogram") {
      const weight = Number(point.count);
      return point.sum === null || weight <= 0 || !Number.isFinite(weight)
        ? []
        : [{ value: point.sum / weight, weight }];
    }
    const value = numberValue(point);
    return value === null ? [] : [{ value, weight: 1 }];
  });
  weighted.sort((left, right) => left.value - right.value);
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (total === 0) return null;
  const threshold = total * target;
  let seen = 0;
  for (const item of weighted) {
    seen += item.weight;
    if (seen >= threshold) return item.value;
  }
  return weighted.at(-1)?.value ?? null;
};

const streamKey = (point: MetricPoint) =>
  JSON.stringify([
    point.scope.name,
    point.scope.version,
    renderValue(
      combinedAttributes(String(point.serviceName), point.resource.attributes, point.attributes),
    ),
  ]);

const cumulativeRateContributions = (points: ReadonlyArray<MetricPoint>) => {
  const streams = new Map<string, Array<SumPoint>>();
  for (const point of points) {
    if (point._tag !== "sum" || point.temporality !== "cumulative") continue;
    const key = streamKey(point);
    const stream = streams.get(key) ?? [];
    stream.push(point);
    streams.set(key, stream);
  }

  const contributions = new Map<MetricPoint, number>();
  for (const stream of streams.values()) {
    stream.sort((left, right) => Number(left.timeUnixNano - right.timeUnixNano));
    let previous: SumPoint | undefined;
    for (const point of stream) {
      if (previous !== undefined) {
        const currentValue = numberValue(point);
        const previousValue = numberValue(previous);
        if (currentValue !== null && previousValue !== null) {
          const reset =
            point.startTimeUnixNano !== previous.startTimeUnixNano ||
            (point.monotonic && currentValue < previousValue);
          contributions.set(point, reset ? currentValue : currentValue - previousValue);
        }
      }
      previous = point;
    }
  }
  return contributions;
};

const aggregate = (
  points: ReadonlyArray<MetricPoint>,
  aggregation: MetricQuery["aggregation"],
  bucketSeconds: number,
  distinctKey: MetricQuery["distinctKey"],
  cumulativeRates: ReadonlyMap<MetricPoint, number>,
) => {
  if (aggregation === "count-distinct" && distinctKey !== undefined) {
    return new Set(
      points.flatMap((point) => {
        const all = combinedAttributes(
          String(point.serviceName),
          point.resource.attributes,
          point.attributes,
        );
        const value = all[String(distinctKey)];
        return value === undefined ? [] : [renderValue(value)];
      }),
    ).size;
  }
  if (aggregation === "p50") return weightedPercentile(points, 0.5);
  if (aggregation === "p95") return weightedPercentile(points, 0.95);
  if (aggregation === "p99") return weightedPercentile(points, 0.99);
  const values = points.flatMap((point) => {
    const value =
      aggregation === "rate" && point._tag === "sum" && point.temporality === "cumulative"
        ? cumulativeRates.get(point)
        : pointValue(point, aggregation);
    return value === undefined || value === null || !Number.isFinite(value) ? [] : [value];
  });
  if (values.length === 0) return null;
  if (aggregation === "min") return Math.min(...values);
  if (aggregation === "max") return Math.max(...values);
  if (aggregation === "avg") {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return aggregation === "rate" ? sum / bucketSeconds : sum;
};

const groupFor = (point: MetricPoint, query: MetricQuery) => {
  const all = combinedAttributes(
    String(point.serviceName),
    point.resource.attributes,
    point.attributes,
  );
  const selected: TelemetryAttributes = Object.fromEntries(
    (query.groupBy ?? []).flatMap((key) => {
      const value = all[String(key)];
      return value === undefined ? [] : [[String(key), value]];
    }),
  );
  const label =
    Object.keys(selected).length === 0
      ? String(query.metric)
      : Object.entries(selected)
          .map(([key, value]) => `${key}=${renderValue(value)}`)
          .join(", ");
  return { label, selected, key: JSON.stringify(selected) };
};

export const listMetricCatalog = (metrics: ReadonlyArray<MetricPoint>) => {
  const groups = new Map<string, Array<MetricPoint>>();
  for (const metric of metrics) {
    const group = groups.get(String(metric.name)) ?? [];
    group.push(metric);
    groups.set(String(metric.name), group);
  }
  return Array.from(groups.values())
    .map((points) => {
      points.sort((left, right) => Number(left.timeUnixNano - right.timeUnixNano));
      const first = points[0];
      const last = points.at(-1);
      if (first === undefined || last === undefined) return null;
      const attributeKeys = new Set(
        points.flatMap((point) =>
          Object.keys({
            ...point.resource.attributes,
            ...point.attributes,
          }),
        ),
      );
      const temporalities = Array.from(
        new Set(
          points.flatMap((point) =>
            point._tag === "sum" ||
            point._tag === "histogram" ||
            point._tag === "exponential-histogram"
              ? [point.temporality]
              : [],
          ),
        ),
      );
      const monotonic = last._tag === "sum" ? last.monotonic : null;
      return new MetricCatalogEntry({
        name: last.name,
        description: last.description,
        unit: last.unit,
        metadata: last.metadata,
        type: last._tag,
        temporalities,
        monotonic,
        services: Array.from(new Set(points.map((point) => point.serviceName))),
        attributes: Array.from(attributeKeys)
          .sort()
          .map(
            (key) =>
              new MetricAttribute({
                key: AttributeKey.make(key),
                examples: Array.from(
                  new Set(
                    points.flatMap((point) => {
                      const value = point.attributes[key] ?? point.resource.attributes[key];
                      return value === undefined ? [] : [renderValue(value)];
                    }),
                  ),
                ).slice(0, 8),
              }),
          ),
        firstSeenAt: DateTime.fromDateUnsafe(new Date(nanosToMillis(first.timeUnixNano))),
        lastSeenAt: DateTime.fromDateUnsafe(new Date(nanosToMillis(last.timeUnixNano))),
      });
    })
    .filter((entry): entry is MetricCatalogEntry => entry !== null)
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
};

export const queryMetricPoints = (metrics: ReadonlyArray<MetricPoint>, query: MetricQuery) =>
  Effect.gen(function* () {
    const named = metrics.filter((point) => point.name === query.metric);
    if (named.length === 0) {
      return yield* new MetricNotFound({
        metric: query.metric,
        message: `Metric ${query.metric} has not been observed`,
      });
    }
    const bounds = yield* timeBounds(query.range);
    const maximumWindowSeconds = 7 * 24 * 60 * 60; // 7 days
    if (bounds.end - bounds.start > maximumWindowSeconds * 1_000) {
      return yield* new QueryTooBroad({
        maximumWindowSeconds,
        message: "Metric queries are limited to a 7 day window",
      });
    }
    const step = stepMillis[query.step ?? "30s"];
    const cumulativeRates = cumulativeRateContributions(named);
    const grouped = new Map<
      string,
      {
        readonly label: string;
        readonly attributes: TelemetryAttributes;
        readonly buckets: Map<number, Array<MetricPoint>>;
      }
    >();
    for (const point of named) {
      const at = nanosToMillis(point.timeUnixNano);
      const all = combinedAttributes(
        String(point.serviceName),
        point.resource.attributes,
        point.attributes,
      );
      if (at < bounds.start || at > bounds.end || !matchesFilters(all, query.filters)) continue;
      const group = groupFor(point, query);
      const target = grouped.get(group.key) ?? {
        label: group.label,
        attributes: group.selected,
        buckets: new Map(),
      };
      const bucket = Math.floor(at / step) * step;
      const bucketPoints = target.buckets.get(bucket) ?? [];
      bucketPoints.push(point);
      target.buckets.set(bucket, bucketPoints);
      grouped.set(group.key, target);
    }

    const maxSeries = query.maxSeries ?? 12;
    const maxPoints = query.maxPoints ?? 600;
    const allGroups = Array.from(grouped.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
    let remainingPoints = maxPoints;
    let partial = allGroups.length > maxSeries;
    const series = allGroups.slice(0, maxSeries).map((group) => {
      const available = Array.from(group.buckets.entries()).sort(([left], [right]) => left - right);
      const selected = available.slice(0, remainingPoints);
      if (selected.length < available.length) partial = true;
      remainingPoints -= selected.length;
      return new MetricSeries({
        label: group.label,
        attributes: group.attributes,
        points: selected.flatMap(([at, points]) => {
          const value = aggregate(
            points,
            query.aggregation,
            step / 1_000,
            query.distinctKey,
            cumulativeRates,
          );
          return value === null
            ? []
            : [new MetricSeriesPoint({ at: DateTime.fromDateUnsafe(new Date(at)), value })];
        }),
      });
    });
    const values = series.flatMap((item) => item.points.map((point) => point.value));
    const sum = values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
    return new MetricQueryResult({
      query,
      series,
      stats: new MetricQueryStats({
        minimum: values.length === 0 ? null : Math.min(...values),
        maximum: values.length === 0 ? null : Math.max(...values),
        average: sum === null ? null : sum / values.length,
        sum,
        count: values.length,
        last: values.at(-1) ?? null,
      }),
      pointCount: values.length,
      partial,
      hint: partial ? "Narrow the time range or add filters to return every series" : null,
    });
  });
