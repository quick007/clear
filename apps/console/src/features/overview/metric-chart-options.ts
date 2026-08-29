import type {
  Axis,
  ChartThreshold,
  MetricChartPanel,
  PanelAnnotation,
} from "@groundtruth/panel-dsl";
import { MetricSeriesPoint } from "@groundtruth/telemetry";
import type { ECBasicOption } from "echarts/types/dist/shared";

import { epochMilliseconds } from "../../data/format";
import type { PanelSeries } from "../../data/panels";
import { formatPanelValue } from "../board/panel-format";

export type RenderAnnotation =
  | PanelAnnotation
  | {
      readonly _tag: "deploy" | "note";
      readonly atMs: number;
      readonly label: string;
    };

export type MetricChartOptionsInput = {
  readonly annotations?: ReadonlyArray<RenderAnnotation>;
  readonly axes: ReadonlyArray<Axis>;
  readonly compact?: boolean;
  readonly reducedMotion?: boolean;
  readonly resolvedUnits?: Readonly<Partial<Record<"left" | "right", string>>>;
  readonly series: ReadonlyArray<PanelSeries>;
  readonly stacking?: MetricChartPanel["stacking"];
  readonly thresholds?: ReadonlyArray<ChartThreshold>;
  readonly visualization: Exclude<MetricChartPanel["visualization"], "heatmap">;
};

const severityColors = {
  critical: "#f87171",
  info: "#38bdf8",
  warning: "#fbbf24",
} as const;

export const buildMetricChartOption = ({
  annotations = [],
  axes,
  compact = false,
  reducedMotion = false,
  resolvedUnits = {},
  series,
  stacking = "none",
  thresholds = [],
  visualization,
}: MetricChartOptionsInput): ECBasicOption => {
  const axisIndex = new Map(axes.map((axis, index) => [axis.id, index]));
  const normalizedSeries = stacking === "percent" ? normalizePercentSeries(series) : series;
  const firstSeriesForAxis = new Map<"left" | "right", number>();
  series.forEach((item, index) => {
    if (!firstSeriesForAxis.has(item.axis)) firstSeriesForAxis.set(item.axis, index);
  });

  return {
    animationDuration: reducedMotion ? 0 : 200,
    animationEasing: "cubicOut",
    grid: {
      bottom: compact ? 8 : 28,
      containLabel: true,
      left: 8,
      right: axes.length > 1 ? 12 : 16,
      top: compact ? 10 : 24,
    },
    tooltip: {
      axisPointer: { lineStyle: { color: "#44403c", type: "dashed" } },
      backgroundColor: "#1c1917",
      borderColor: "#44403c",
      borderWidth: 1,
      extraCssText: "border-radius:8px; box-shadow:none;",
      textStyle: { color: "#e7e5e4", fontFamily: "IBM Plex Sans", fontSize: 12 },
      trigger: "axis",
    },
    xAxis: {
      axisLabel: {
        color: "#78716c",
        fontFamily: "IBM Plex Mono",
        fontSize: 10,
        hideOverlap: true,
        margin: 12,
      },
      axisLine: { lineStyle: { color: "#292524" } },
      axisTick: { show: false },
      boundaryGap: visualization === "bar",
      splitLine: { show: false },
      type: "time",
    },
    yAxis: axes.map((axis) => ({
      axisLabel: {
        color: "#78716c",
        fontFamily: "IBM Plex Mono",
        fontSize: 10,
        formatter: (value: number) =>
          stacking === "percent"
            ? `${Math.round(value * 100)}%`
            : formatPanelValue(value, axis.unit, resolvedUnits[axis.id]),
        show: !compact,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      max: stacking === "percent" ? 1 : axis.maximum,
      min: stacking === "percent" ? 0 : axis.minimum,
      name: compact ? undefined : axis.label,
      nameGap: 12,
      nameTextStyle: { color: "#78716c", fontFamily: "IBM Plex Sans", fontSize: 10 },
      position: axis.id,
      scale: axis.minimum === undefined && axis.maximum === undefined,
      splitLine: {
        lineStyle: { color: "rgba(68, 64, 60, 0.42)" },
        show: axis.showGrid ?? axis.id === "left",
      },
      splitNumber: compact ? 2 : 3,
      type: axis.scale === "log" ? "log" : "value",
    })),
    series: normalizedSeries.map((item, index) => {
      const axisThresholds =
        firstSeriesForAxis.get(item.axis) === index
          ? thresholds.filter((threshold) => threshold.axis === item.axis)
          : [];
      const chartAnnotations = index === 0 ? annotations : [];
      const markLines = [
        ...axisThresholds.map((threshold) => ({
          label: {
            color: severityColors[threshold.severity],
            formatter: threshold.label ?? threshold.severity,
            position: "insideEndTop",
          },
          lineStyle: {
            color: severityColors[threshold.severity],
            type: "dashed",
            width: 1,
          },
          yAxis: threshold.value,
        })),
        ...chartAnnotations.map((annotation) => ({
          label: {
            color: annotation._tag === "deploy" ? "#fbbf24" : "#38bdf8",
            formatter: annotation.label,
            position: "insideEndTop",
          },
          lineStyle: {
            color: annotation._tag === "deploy" ? "#fbbf24" : "#38bdf8",
            type: "dashed",
            width: 1,
          },
          xAxis: annotation.atMs,
        })),
      ];
      const fillOpacity =
        item.fillOpacity ?? (visualization === "area" ? (index === 0 ? 0.1 : 0.18) : 0);
      const common = {
        data: item.points.map((point) => [epochMilliseconds(point.at), point.value] as const),
        emphasis: { focus: "series" },
        itemStyle: { color: item.color, opacity: visualization === "bar" ? 0.82 : 1 },
        markLine:
          markLines.length > 0
            ? { data: markLines, silent: true, symbol: ["none", "none"] }
            : undefined,
        name: item.label,
        stack: stacking === "normal" || stacking === "percent" ? `panel-${item.axis}` : undefined,
        yAxisIndex: axisIndex.get(item.axis) ?? 0,
      };
      if (visualization === "bar") {
        return {
          ...common,
          barMaxWidth: 20,
          itemStyle: { ...common.itemStyle, opacity: item.fillOpacity ?? 0.82 },
          type: "bar" as const,
        };
      }
      return {
        ...common,
        areaStyle: fillOpacity > 0 ? { color: item.color, opacity: fillOpacity } : undefined,
        lineStyle: { color: item.color, type: item.lineStyle, width: 1.5 },
        showSymbol: false,
        smooth: 0.18,
        type: "line" as const,
      };
    }),
  };
};

const normalizePercentSeries = (series: ReadonlyArray<PanelSeries>) => {
  const totals = new Map<string, number>();
  for (const item of series) {
    for (const point of item.points) {
      const at = epochMilliseconds(point.at);
      const key = `${item.axis}:${at}`;
      totals.set(key, (totals.get(key) ?? 0) + point.value);
    }
  }
  return series.map((item) => ({
    ...item,
    points: item.points.map((point) => {
      const total = totals.get(`${item.axis}:${epochMilliseconds(point.at)}`) ?? 0;
      return new MetricSeriesPoint({
        at: point.at,
        value: total === 0 ? 0 : point.value / total,
      });
    }),
  }));
};
