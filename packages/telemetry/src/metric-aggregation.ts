import { DateTime, Result, Schema } from "effect";
import {
  type MetricAggregateQuery,
  MetricAggregateResult,
  type MetricPoint,
  type SumPoint,
} from "./metrics.ts";
import { metricRangeDurationSeconds } from "./query-policy.ts";

export type PercentileAggregation = "p50" | "p95" | "p99";

export class MetricPointAggregationError extends Schema.TaggedError<MetricPointAggregationError>()(
  "MetricPointAggregationError",
  {
    reason: Schema.String,
  },
) {}

interface ExplicitHistogramDistribution {
  readonly bounds: ReadonlyArray<number>;
  readonly counts: ReadonlyArray<bigint>;
  readonly minimum: number | null;
  readonly maximum: number | null;
}

type HistogramPercentileResult =
  | { readonly _tag: "value"; readonly value: number }
  | { readonly _tag: "invalid"; readonly reason: string };

const percentileRatio = {
  p50: [50n, 100n],
  p95: [95n, 100n],
  p99: [99n, 100n],
} as const;

const invalidPercentile = (reason: string): HistogramPercentileResult => ({
  _tag: "invalid",
  reason,
});

const finiteOrNull = (value: number | null) => value === null || Number.isFinite(value);

const validBounds = (bounds: ReadonlyArray<number>) =>
  bounds.every(
    (bound, index) =>
      Number.isFinite(bound) && (index === 0 || bound > (bounds[index - 1] ?? bound)),
  );

/** Approximates a quantile from merged OpenTelemetry explicit histogram buckets. */
export const approximateExplicitHistogramPercentile = (
  distribution: ExplicitHistogramDistribution,
  aggregation: PercentileAggregation,
): HistogramPercentileResult => {
  const { bounds, counts, minimum, maximum } = distribution;
  if (!validBounds(bounds)) {
    return invalidPercentile("explicit histogram bounds must be finite and ordered");
  }
  if (counts.length !== bounds.length + 1) {
    return invalidPercentile("explicit histogram bucket count does not match its bounds");
  }
  if (counts.some((count) => count < 0n)) {
    return invalidPercentile("histogram bucket counts cannot be negative");
  }
  if (!finiteOrNull(minimum) || !finiteOrNull(maximum)) {
    return invalidPercentile("histogram extrema must be finite when present");
  }

  const total = counts.reduce((sum, count) => sum + count, 0n);
  if (total === 0n)
    return invalidPercentile("cannot calculate a percentile for an empty histogram");
  const [numerator, denominator] = percentileRatio[aggregation];
  const rank = (total * numerator + denominator - 1n) / denominator;
  let cumulative = 0n;

  for (const [index, count] of counts.entries()) {
    const next = cumulative + count;
    if (count > 0n && rank <= next) {
      const finiteLower = index === 0 ? minimum : bounds[index - 1];
      const finiteUpper = index === bounds.length ? maximum : bounds[index];
      const lower = finiteLower ?? finiteUpper;
      const upper = finiteUpper ?? finiteLower;
      if (
        lower === null ||
        lower === undefined ||
        upper === null ||
        upper === undefined ||
        upper < lower
      ) {
        return invalidPercentile("histogram extrema do not bound the selected bucket");
      }
      if (lower === upper) return { _tag: "value", value: lower };
      const position = Number(rank - cumulative) / Number(count);
      return { _tag: "value", value: lower + (upper - lower) * position };
    }
    cumulative = next;
  }
  return invalidPercentile("histogram rank exceeded its merged bucket counts");
};

const valueText = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return String(value);
  return (
    JSON.stringify(value, (_, entry: unknown) =>
      typeof entry === "bigint" ? String(entry) : entry,
    ) ?? String(value)
  );
};

const queryAttributes = (point: MetricPoint): Readonly<Record<string, unknown>> => ({
  ...point.resource.attributes,
  ...point.attributes,
  "service.name": point.serviceName,
});

const matchesFilters = (point: MetricPoint, query: MetricAggregateQuery) => {
  const attributes = queryAttributes(point);
  return (query.filters ?? []).every((filter) => {
    const present = Object.hasOwn(attributes, filter.key);
    const actual = attributes[filter.key];
    if (filter.operator === "exists") return present;
    if (filter.operator === "not-equals") {
      return !present || valueText(actual) !== valueText(filter.value);
    }
    if (!present) return false;
    if (filter.operator === "equals") return valueText(actual) === valueText(filter.value);
    return valueText(actual).toLowerCase().includes(valueText(filter.value).toLowerCase());
  });
};

const inRange = (point: MetricPoint, query: MetricAggregateQuery, nowMillis: number) => {
  const millis = Number(point.timeUnixNano / 1_000_000n);
  if (query.range._tag === "absolute") {
    return (
      millis >= DateTime.toEpochMillis(query.range.start) &&
      millis <= DateTime.toEpochMillis(query.range.end)
    );
  }
  const durationMillis = metricRangeDurationSeconds(query.range) * 1_000;
  return millis >= nowMillis - durationMillis && millis <= nowMillis;
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

const cumulativeStreamKey = (point: SumPoint) =>
  valueText({
    serviceName: point.serviceName,
    resource: point.resource,
    scope: point.scope,
    attributes: point.attributes,
    metadata: point.metadata,
  });

const rateContributionByPoint = (points: ReadonlyArray<MetricPoint>) => {
  const contributions = new Map<MetricPoint, number>();
  const isCumulativeSum = (point: MetricPoint): point is SumPoint =>
    point._tag === "sum" && point.temporality === "cumulative";
  const cumulativeStreams = Map.groupBy(points.filter(isCumulativeSum), cumulativeStreamKey);
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

const percentile = (values: ReadonlyArray<number>, fraction: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? 0;
};

const aggregateHistogramPercentile = (
  points: ReadonlyArray<Extract<MetricPoint, { readonly _tag: "histogram" }>>,
  aggregation: PercentileAggregation,
) => {
  const first = points[0]!;
  const bounds = first.explicitBounds;
  if (
    points.some(
      (point) =>
        point.explicitBounds.length !== bounds.length ||
        point.explicitBounds.some((bound, index) => bound !== bounds[index]),
    )
  ) {
    return invalidPercentile(
      "Histogram points in the aggregate window use incompatible explicit bounds.",
    );
  }
  const minima = points.flatMap((point) => (point.minimum === null ? [] : [point.minimum]));
  const maxima = points.flatMap((point) => (point.maximum === null ? [] : [point.maximum]));
  return approximateExplicitHistogramPercentile(
    {
      bounds,
      counts: Array.from({ length: bounds.length + 1 }, (_, index) =>
        points.reduce((total, point) => total + (point.bucketCounts[index] ?? 0n), 0n),
      ),
      minimum: minima.length === 0 ? null : Math.min(...minima),
      maximum: maxima.length === 0 ? null : Math.max(...maxima),
    },
    aggregation,
  );
};

const failure = (reason: string) => Result.fail(new MetricPointAggregationError({ reason }));

/**
 * Aggregates raw metric points across one complete query window.
 *
 * Rate uses every matching stream point to establish cumulative predecessors,
 * then sums only contributions whose current point lies inside the window.
 */
export const aggregateMetricPoints = (
  metrics: ReadonlyArray<MetricPoint>,
  query: MetricAggregateQuery,
  nowMillis: number,
) => {
  const eligible = metrics.filter(
    (point) => point.name === query.metric && matchesFilters(point, query),
  );
  const matching = eligible.filter((point) => inRange(point, query, nowMillis));
  const matchedPoints = matching.length;
  const result = (value: number | null) =>
    Result.succeed(new MetricAggregateResult({ value, matchedPoints }));
  if (matchedPoints === 0) return result(null);

  if (query.aggregation === "count-distinct") {
    const key = query.distinctKey!;
    return result(
      new Set(
        matching.flatMap((point) => {
          const attributes = queryAttributes(point);
          return Object.hasOwn(attributes, key) ? [valueText(attributes[key])] : [];
        }),
      ).size,
    );
  }

  if (query.aggregation === "rate") {
    const contributions = rateContributionByPoint(eligible);
    const values = matching.flatMap((point) => {
      const contribution = contributions.get(point);
      return contribution === undefined ? [] : [contribution];
    });
    return result(
      values.length === 0
        ? null
        : values.reduce((total, value) => total + value, 0) /
            metricRangeDurationSeconds(query.range),
    );
  }

  if (query.aggregation === "p50" || query.aggregation === "p95" || query.aggregation === "p99") {
    const types = new Set(matching.map((point) => point._tag));
    if (types.has("exponential-histogram") || types.has("summary")) {
      return failure("Percentiles for exponential histograms and summaries are not supported.");
    }
    if (types.has("histogram") && types.size > 1) {
      return failure("A percentile aggregate cannot combine histograms with numeric points.");
    }
    if (types.has("histogram")) {
      const histogramPoints = matching.filter(
        (point): point is Extract<MetricPoint, { readonly _tag: "histogram" }> =>
          point._tag === "histogram",
      );
      const histogram = aggregateHistogramPercentile(histogramPoints, query.aggregation);
      return histogram._tag === "invalid" ? failure(histogram.reason) : result(histogram.value);
    }
    return result(
      percentile(
        matching.map((point) => metricContribution(point).value),
        query.aggregation === "p50" ? 0.5 : query.aggregation === "p95" ? 0.95 : 0.99,
      ),
    );
  }

  const contributions = matching.map(metricContribution);
  const total = contributions.reduce((sum, contribution) => sum + contribution.total, 0);
  const count = contributions.reduce((sum, contribution) => sum + contribution.count, 0);
  switch (query.aggregation) {
    case "sum":
      return result(total);
    case "avg":
      return result(count === 0 ? null : total / count);
    case "count":
      return result(count);
    case "min":
      return result(Math.min(...contributions.map(({ minimum }) => minimum)));
    case "max":
      return result(Math.max(...contributions.map(({ maximum }) => maximum)));
  }
};
