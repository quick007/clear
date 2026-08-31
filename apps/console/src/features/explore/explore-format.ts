import { QueryRef } from "@groundtruth/panel-dsl";
import type {
  MetricAggregation,
  MetricCatalogEntry,
  MetricQueryResult,
  TelemetryWindow,
} from "@groundtruth/telemetry";

import { metricQueryBucketDuration, panelPalette, type PanelSeries } from "../../data/panels";
import { formatPanelValue } from "../board/panel-format";

export const windowLabels: Record<TelemetryWindow, string> = {
  "5m": "last 5 minutes",
  "15m": "last 15 minutes",
  "1h": "last hour",
  "3h": "last 3 hours",
  "6h": "last 6 hours",
  "12h": "last 12 hours",
  "24h": "last 24 hours",
  "7d": "last 7 days",
};

export const aggregationFor = (metric: MetricCatalogEntry): MetricAggregation => {
  if (metric.type === "histogram" || metric.type === "exponential-histogram") return "p95";
  if (metric.type === "sum" && metric.monotonic) return "rate";
  if (metric.type === "sum") return "sum";
  if (metric.type === "summary") return "p95";
  return "avg";
};

export const toPanelSeries = (result: MetricQueryResult): ReadonlyArray<PanelSeries> =>
  result.series.map((series, index) => {
    const tones = ["amber", "blue", "green", "violet", "orange", "red", "cyan", "gray"] as const;
    const tone = tones[index % tones.length]!;
    return {
      attributes: series.attributes,
      axis: "left",
      bucketDurationMs: metricQueryBucketDuration(result.query.step),
      color: panelPalette[tone],
      label: series.label,
      lineStyle: "solid",
      points: series.points,
      queryRef: QueryRef.make(String.fromCharCode(65 + index)),
      tone,
    };
  });

export const formatMetricStat = (value: number | null | undefined, unit: string) =>
  value === null || value === undefined
    ? "No data"
    : formatPanelValue(value, { _tag: "auto" }, unit);
