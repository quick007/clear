import type {
  Axis,
  ChartThreshold,
  MetricChartPanel,
  PanelAnnotation,
} from "@groundtruth/panel-dsl";

import { epochMilliseconds } from "../../data/format";
import type { PanelSeries } from "../../data/panels";

export type RenderAnnotation =
  | PanelAnnotation
  | {
      readonly _tag: "deploy" | "note";
      readonly atMs: number;
      readonly label: string;
    };

export type MetricChartModelInput = {
  readonly annotations?: ReadonlyArray<RenderAnnotation>;
  readonly axes: ReadonlyArray<Axis>;
  readonly compact?: boolean;
  readonly resolvedUnits?: Readonly<Partial<Record<"left" | "right", string>>>;
  readonly series: ReadonlyArray<PanelSeries>;
  readonly stacking?: MetricChartPanel["stacking"];
  readonly thresholds?: ReadonlyArray<ChartThreshold>;
  readonly visualization: Exclude<MetricChartPanel["visualization"], "heatmap">;
};

export type MetricChartRow = { readonly atMs: number } & Record<string, number | undefined>;

export type MetricChartSeries = {
  readonly axis: "left" | "right";
  readonly color: string;
  readonly fillOpacity: number;
  readonly key: string;
  readonly label: string;
  readonly lineStyle: "solid" | "dashed";
  readonly stackId?: string;
};

export type MetricChartModel = {
  readonly annotations: ReadonlyArray<RenderAnnotation>;
  readonly axes: ReadonlyArray<Axis>;
  readonly compact: boolean;
  readonly invalidLogAxis?: "left" | "right";
  readonly resolvedUnits: Readonly<Partial<Record<"left" | "right", string>>>;
  readonly rows: ReadonlyArray<MetricChartRow>;
  readonly series: ReadonlyArray<MetricChartSeries>;
  readonly stacking: NonNullable<MetricChartPanel["stacking"]>;
  readonly thresholds: ReadonlyArray<ChartThreshold>;
  readonly timeDomain: readonly [number, number];
  readonly visualization: Exclude<MetricChartPanel["visualization"], "heatmap">;
};

export function buildMetricChartModel({
  annotations = [],
  axes,
  compact = false,
  resolvedUnits = {},
  series,
  stacking = "none",
  thresholds = [],
  visualization,
}: MetricChartModelInput): MetricChartModel {
  const totals = stacking === "percent" ? percentTotals(series) : new Map<string, number>();
  const rowsByTime = new Map<number, MetricChartRow>();
  const descriptors = series.map((item, index) => {
    const key = `series-${index}`;
    for (const point of item.points) {
      const atMs = epochMilliseconds(point.at);
      const row = rowsByTime.get(atMs) ?? { atMs };
      const total = totals.get(`${item.axis}:${atMs}`);
      row[key] = total === undefined ? point.value : total === 0 ? 0 : point.value / total;
      rowsByTime.set(atMs, row);
    }
    return {
      axis: item.axis,
      color: item.color,
      fillOpacity: item.fillOpacity ?? (visualization === "area" ? (index === 0 ? 0.12 : 0.18) : 0),
      key,
      label: item.label,
      lineStyle: item.lineStyle,
      stackId: stacking === "none" ? undefined : `panel-${item.axis}`,
    } satisfies MetricChartSeries;
  });
  const rows = [...rowsByTime.values()].toSorted((left, right) => left.atMs - right.atMs);
  const firstAt = rows[0]?.atMs ?? Date.now();
  const lastAt = rows.at(-1)?.atMs ?? firstAt;
  const timeDomain =
    firstAt === lastAt
      ? ([firstAt - 1_000, lastAt + 1_000] as const)
      : ([firstAt, lastAt] as const);
  const invalidLogAxis = axes.find(
    (axis) =>
      axis.scale === "log" &&
      series.some((item) => item.axis === axis.id && item.points.some((point) => point.value <= 0)),
  )?.id;

  return {
    annotations,
    axes,
    compact,
    invalidLogAxis,
    resolvedUnits,
    rows,
    series: descriptors,
    stacking,
    thresholds,
    timeDomain,
    visualization,
  };
}

const percentTotals = (series: ReadonlyArray<PanelSeries>) => {
  const totals = new Map<string, number>();
  for (const item of series) {
    for (const point of item.points) {
      const key = `${item.axis}:${epochMilliseconds(point.at)}`;
      totals.set(key, (totals.get(key) ?? 0) + point.value);
    }
  }
  return totals;
};
