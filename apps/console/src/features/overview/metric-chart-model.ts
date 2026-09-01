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
  readonly axisDomains: Readonly<
    Record<"left" | "right", readonly [number | "auto", number | "auto"]>
  >;
  readonly axes: ReadonlyArray<Axis>;
  readonly axisTicks: Readonly<Partial<Record<"left" | "right", ReadonlyArray<number>>>>;
  readonly compact: boolean;
  readonly gridAxisId?: "left" | "right";
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
    const attributes = Object.entries(item.attributes)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(",");
    const key = `${item.queryRef}:${attributes || item.label}`;
    for (const point of item.points) {
      const atMs = alignedBucketTimestamp(point.at, item.bucketDurationMs);
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
      (series.some(
        (item) => item.axis === axis.id && item.points.some((point) => point.value <= 0),
      ) ||
        thresholds.some((threshold) => threshold.axis === axis.id && threshold.value <= 0)),
  )?.id;
  const gridAxisId = axes.find((axis) => axis.showGrid !== false)?.id;
  const axisScales = Object.fromEntries(
    (["left", "right"] as const).map((axisId) => [
      axisId,
      axisScale(
        axes.find((axis) => axis.id === axisId),
        series.filter((item) => item.axis === axisId),
        thresholds.filter((threshold) => threshold.axis === axisId),
        stacking,
      ),
    ]),
  ) as Record<"left" | "right", AxisScale>;

  return {
    annotations,
    axisDomains: {
      left: axisScales.left.domain,
      right: axisScales.right.domain,
    },
    axisTicks: {
      left: axisScales.left.ticks,
      right: axisScales.right.ticks,
    },
    axes,
    compact,
    gridAxisId,
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

type AxisScale = {
  readonly domain: readonly [number | "auto", number | "auto"];
  readonly ticks?: ReadonlyArray<number>;
};

const axisScale = (
  axis: Axis | undefined,
  series: ReadonlyArray<PanelSeries>,
  thresholds: ReadonlyArray<ChartThreshold>,
  stacking: NonNullable<MetricChartPanel["stacking"]>,
): AxisScale => {
  if (!axis) return { domain: ["auto", "auto"] };
  const values = [
    ...(stacking === "normal"
      ? normalStackExtents(series)
      : series.flatMap((item) => item.points.map((point) => point.value))),
    ...thresholds.map((threshold) => threshold.value),
  ];
  if (values.length === 0) {
    return { domain: [axis.minimum ?? "auto", axis.maximum ?? "auto"] };
  }

  const smallest = Math.min(...values);
  const largest = Math.max(...values);
  const span = largest - smallest;
  const fallbackSpan = Math.max(Math.abs(largest), 1);
  const padding = (span === 0 ? fallbackSpan : span) * 0.06;
  if (axis.scale === "log") {
    return { domain: [axis.minimum ?? smallest, axis.maximum ?? largest + padding] };
  }
  const minimum = axis.minimum ?? smallest - padding;
  const maximum = axis.maximum ?? largest + padding;
  const expandedMaximum = minimum === maximum ? maximum + fallbackSpan : maximum;
  return niceLinearScale(minimum, expandedMaximum, axis.minimum, axis.maximum);
};

const normalStackExtents = (series: ReadonlyArray<PanelSeries>) => {
  const totals = new Map<number, { negative: number; positive: number }>();
  for (const item of series) {
    for (const point of item.points) {
      const atMs = alignedBucketTimestamp(point.at, item.bucketDurationMs);
      const total = totals.get(atMs) ?? { negative: 0, positive: 0 };
      if (point.value < 0) total.negative += point.value;
      else total.positive += point.value;
      totals.set(atMs, total);
    }
  }
  return [...totals.values()].flatMap(({ negative, positive }) => [negative, positive]);
};

const targetTickIntervals = 5;

const niceLinearScale = (
  minimum: number,
  maximum: number,
  fixedMinimum: number | undefined,
  fixedMaximum: number | undefined,
): AxisScale => {
  const step = niceStep((maximum - minimum) / targetTickIntervals);
  const domainMinimum = fixedMinimum ?? Math.floor(minimum / step) * step;
  const domainMaximum = fixedMaximum ?? Math.ceil(maximum / step) * step;
  const ticks = Array.from(
    { length: Math.floor((domainMaximum - domainMinimum) / step) + 1 },
    (_, index) => normalizeTick(domainMinimum + index * step),
  );
  if (ticks.at(-1) !== domainMaximum) ticks.push(domainMaximum);
  return { domain: [domainMinimum, domainMaximum], ticks };
};

const niceStep = (roughStep: number) => {
  if (!Number.isFinite(roughStep) || roughStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
};

const normalizeTick = (value: number) => Number(value.toPrecision(12));

const percentTotals = (series: ReadonlyArray<PanelSeries>) => {
  const totals = new Map<string, number>();
  for (const item of series) {
    for (const point of item.points) {
      const key = `${item.axis}:${alignedBucketTimestamp(point.at, item.bucketDurationMs)}`;
      totals.set(key, (totals.get(key) ?? 0) + point.value);
    }
  }
  return totals;
};

const alignedBucketTimestamp = (at: PanelSeries["points"][number]["at"], durationMs: number) =>
  Math.floor(epochMilliseconds(at) / durationMs) * durationMs;
