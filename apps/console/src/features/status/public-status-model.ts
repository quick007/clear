import type { PublicStatusMetric, PublicStatusState } from "@groundtruth/api-contract";
import type { Axis } from "@groundtruth/panel-dsl";
import { QueryRef } from "@groundtruth/panel-dsl";
import { DateTime } from "effect";

import type { PanelSeries } from "../../data/panels";
import { panelPalette } from "../../data/panels";

export const publicStatusPresentation = {
  operational: {
    headline: "All systems operational",
    label: "Operational",
    tone: "healthy",
  },
  degraded: {
    headline: "Some systems are degraded",
    label: "Degraded",
    tone: "attention",
  },
  unavailable: {
    headline: "Service disruption",
    label: "Unavailable",
    tone: "critical",
  },
} as const satisfies Record<
  PublicStatusState,
  {
    readonly headline: string;
    readonly label: string;
    readonly tone: "healthy" | "attention" | "critical";
  }
>;

const seriesTones = ["green", "blue", "orange", "violet"] as const;
const queryRefs = ["A", "B", "C", "D"] as const;

export const publicMetricAxis = (metric: PublicStatusMetric): Axis => ({
  id: "left",
  minimum: 0,
  unit:
    metric.unit === "ms"
      ? { _tag: "duration", input: "ms", display: "ms", decimals: 0 }
      : { _tag: "rate", per: "second", noun: "requests", decimals: 1 },
});

export const publicMetricSeries = (metric: PublicStatusMetric): ReadonlyArray<PanelSeries> =>
  metric.series.map((series, index) => {
    const tone = seriesTones[index % seriesTones.length]!;
    return {
      attributes: {},
      axis: "left",
      bucketDurationMs: bucketDuration(series.points),
      color: panelPalette[tone],
      fillOpacity: index === 0 ? 0.11 : 0.04,
      label: series.label,
      lineStyle: "solid",
      points: series.points,
      queryRef: QueryRef.make(queryRefs[index]!),
      tone,
    };
  });

export const latestMetricValue = (metric: PublicStatusMetric) => {
  const latestValues = metric.series.flatMap((series) => {
    const latest = series.points.at(-1)?.value;
    return latest === undefined ? [] : [latest];
  });
  if (latestValues.length === 0) return undefined;
  return metric.key === "request-rate"
    ? latestValues.reduce((total, value) => total + value, 0)
    : Math.max(...latestValues);
};

export const formatPublicMetricValue = (metric: PublicStatusMetric, value: number) =>
  metric.unit === "ms"
    ? `${Math.round(value).toLocaleString()} ms`
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} req/s`;

const bucketDuration = (points: PublicStatusMetric["series"][number]["points"]) => {
  const latest = points.at(-1)?.at;
  const previous = points.at(-2)?.at;
  if (latest === undefined || previous === undefined) return 10 * 1_000; // 10 seconds
  const duration = DateTime.toEpochMillis(latest) - DateTime.toEpochMillis(previous);
  return duration > 0 ? duration : 10 * 1_000; // 10 seconds
};
