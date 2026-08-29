export type PercentileAggregation = "p50" | "p95" | "p99";

export interface ExplicitHistogramDistribution {
  readonly bounds: ReadonlyArray<number>;
  readonly counts: ReadonlyArray<bigint>;
  readonly minimum: number | null;
  readonly maximum: number | null;
}

export type HistogramPercentileResult =
  | { readonly _tag: "value"; readonly value: number }
  | { readonly _tag: "invalid"; readonly reason: string };

const percentileRatio = {
  p50: [50n, 100n],
  p95: [95n, 100n],
  p99: [99n, 100n],
} as const;

const invalid = (reason: string): HistogramPercentileResult => ({ _tag: "invalid", reason });

const finiteOrNull = (value: number | null) => value === null || Number.isFinite(value);

const validBounds = (bounds: ReadonlyArray<number>) =>
  bounds.every(
    (bound, index) =>
      Number.isFinite(bound) && (index === 0 || bound > (bounds[index - 1] ?? bound)),
  );

/**
 * Approximates a quantile from merged OTel explicit buckets.
 *
 * The selected bucket is located by nearest rank. Values are assumed to be
 * uniformly distributed inside that bucket, matching the interpolation used
 * by common histogram query engines. Optional OTel min/max values bound the
 * open-ended buckets. Without them, an open-ended bucket resolves to its one
 * finite boundary rather than inventing an unbounded value.
 */
export const approximateExplicitHistogramPercentile = (
  distribution: ExplicitHistogramDistribution,
  aggregation: PercentileAggregation,
): HistogramPercentileResult => {
  const { bounds, counts, minimum, maximum } = distribution;
  if (!validBounds(bounds)) return invalid("explicit histogram bounds must be finite and ordered");
  if (counts.length !== bounds.length + 1) {
    return invalid("explicit histogram bucket count does not match its bounds");
  }
  if (counts.some((count) => count < 0n))
    return invalid("histogram bucket counts cannot be negative");
  if (!finiteOrNull(minimum) || !finiteOrNull(maximum)) {
    return invalid("histogram extrema must be finite when present");
  }

  const total = counts.reduce((sum, count) => sum + count, 0n);
  if (total === 0n) return invalid("cannot calculate a percentile for an empty histogram");
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
        return invalid("histogram extrema do not bound the selected bucket");
      }
      if (lower === upper) return { _tag: "value", value: lower };
      const position = Number(rank - cumulative) / Number(count);
      return { _tag: "value", value: lower + (upper - lower) * position };
    }
    cumulative = next;
  }
  return invalid("histogram rank exceeded its merged bucket counts");
};
