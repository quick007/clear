import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useId, useMemo, useRef } from "react";

import { colorValues } from "../../theme/color-values";
import { colors } from "../../theme/tokens.stylex";
import { formatPanelAxisValue, formatPanelValue, panelAxisCaption } from "../board/panel-format";
import { buildMetricChartModel, type MetricChartModelInput } from "./metric-chart-model";

echarts.use([
  AriaComponent,
  BarChart,
  CanvasRenderer,
  GridComponent,
  LineChart,
  MarkLineComponent,
  ScatterChart,
  TooltipComponent,
]);

type MetricChartProps = MetricChartModelInput & {
  readonly accessibleName: string;
  readonly summary: string;
};

const severityColors = {
  critical: colorValues.red,
  info: colorValues.blue,
  warning: colorValues.amber,
} as const;
const severityRank = { critical: 3, warning: 2, info: 1 } as const;
const thresholdLabelBudget = 2;
const annotationLabelBudget = 2;

export function MetricChart({ accessibleName, summary, ...input }: MetricChartProps) {
  const descriptionId = useId();
  const canvasRef = useRef<HTMLDivElement>(null);
  const model = buildMetricChartModel(input);
  const option = useMemo(() => chartOption(model, accessibleName), [accessibleName, model]);

  useEffect(() => {
    const element = canvasRef.current;
    if (element === null || model.invalidLogAxis !== undefined) return;
    const chart = echarts.init(element, undefined, { renderer: "canvas" });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [model.invalidLogAxis]);

  useEffect(() => {
    const element = canvasRef.current;
    if (element === null || model.invalidLogAxis !== undefined) return;
    echarts.getInstanceByDom(element)?.setOption(option, {
      lazyUpdate: true,
      replaceMerge: ["series", "yAxis"],
    });
  }, [model.invalidLogAxis, option]);

  if (model.invalidLogAxis !== undefined) {
    return (
      <figure
        aria-describedby={descriptionId}
        aria-label={accessibleName}
        {...stylex.props(styles.figure, model.compact && styles.compactFigure)}
      >
        <div role="status" {...stylex.props(styles.invalidScale)}>
          Log scale cannot display zero or negative values on the {model.invalidLogAxis} axis.
        </div>
        <figcaption id={descriptionId} {...stylex.props(styles.screenReaderOnly)}>
          {summary}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure
      aria-describedby={descriptionId}
      aria-label={accessibleName}
      {...stylex.props(styles.figure, model.compact && styles.compactFigure)}
    >
      {model.compact ? null : <AxisCaptions model={model} />}
      <div ref={canvasRef} {...stylex.props(styles.chartCanvas)} />
      <figcaption id={descriptionId} {...stylex.props(styles.screenReaderOnly)}>
        {summary}
      </figcaption>
    </figure>
  );
}

const chartOption = (
  model: ReturnType<typeof buildMetricChartModel>,
  accessibleName: string,
): EChartsCoreOption => {
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const labeledThresholds = new Set(
    model.thresholds
      .map((threshold, index) => ({ index, rank: severityRank[threshold.severity] }))
      .toSorted((left, right) => right.rank - left.rank)
      .slice(0, thresholdLabelBudget)
      .map(({ index }) => index),
  );
  const labeledAnnotations = new Set(
    model.annotations
      .map((annotation, index) => ({ atMs: annotation.atMs, index }))
      .toSorted((left, right) => right.atMs - left.atMs)
      .slice(0, annotationLabelBudget)
      .map(({ index }) => index),
  );
  const thresholdMarks = model.thresholds.map((threshold, index) => ({
    axis: threshold.axis,
    name: threshold.label ?? threshold.severity,
    yAxis: threshold.value,
    lineStyle: {
      color: severityColors[threshold.severity],
      opacity: 0.78,
      type: "dashed" as const,
      width: 1,
    },
    label: {
      color: severityColors[threshold.severity],
      fontFamily: "IBM Plex Mono",
      fontSize: 10,
      formatter: threshold.label ?? threshold.severity,
      position: threshold.axis === "left" ? ("insideStartTop" as const) : ("insideEndTop" as const),
      show: labeledThresholds.has(index),
    },
  }));
  const annotationMarks = model.annotations.map((annotation, index) => ({
    name: annotation.label,
    xAxis: annotation.atMs,
    lineStyle: {
      color: annotation._tag === "deploy" ? colorValues.amber : colorValues.blue,
      opacity: 0.72,
      type: "dashed" as const,
      width: 1,
    },
    label: {
      color: annotation._tag === "deploy" ? colorValues.amber : colorValues.blue,
      fontSize: 10,
      formatter: annotation.label,
      position: "insideEndTop" as const,
      show: labeledAnnotations.has(index),
    },
  }));
  const thresholdOwnerAxes = new Set<string>();
  const primarySeries = model.series.map((series, index) => {
    const data = model.rows.map((row) => [row.atMs, row[series.key] ?? null]);
    const ownsAxisThresholds = !thresholdOwnerAxes.has(series.axis);
    thresholdOwnerAxes.add(series.axis);
    const marks = [
      ...(ownsAxisThresholds
        ? thresholdMarks.filter((threshold) => threshold.axis === series.axis)
        : []),
      ...(index === 0 ? annotationMarks : []),
    ];
    const axis = model.axes.find((candidate) => candidate.id === series.axis);
    const common = {
      id: series.key,
      name: series.label,
      data,
      yAxisIndex: model.axes.findIndex((axis) => axis.id === series.axis),
      animationDurationUpdate: reducedMotion ? 0 : 280,
      animationEasingUpdate: "cubicOut" as const,
      connectNulls: false,
      emphasis: { focus: "series" as const },
      markLine:
        !model.compact && marks.length > 0
          ? { data: marks, silent: true, symbol: ["none", "none"] }
          : undefined,
      tooltip: {
        valueFormatter: (value: unknown) =>
          formatTooltipValue(value, axis?.unit, model.resolvedUnits[series.axis]),
      },
    };
    if (model.visualization === "bar") {
      return {
        ...common,
        type: "bar" as const,
        barMaxWidth: 24,
        itemStyle: { color: series.color, opacity: 0.82, borderRadius: [3, 3, 0, 0] },
        stack: series.stackId,
      };
    }
    return {
      ...common,
      type: "line" as const,
      areaStyle:
        model.visualization === "area"
          ? { color: series.color, opacity: series.fillOpacity }
          : model.compact
            ? undefined
            : { color: series.color, opacity: 0.035 },
      lineStyle: {
        color: series.color,
        type: series.lineStyle,
        width: model.compact ? 1.75 : 2.25,
      },
      sampling: "lttb" as const,
      showSymbol: false,
      smooth: false,
      stack: series.stackId,
      symbol: "circle" as const,
    };
  });
  const latestPoints = model.series.flatMap((series) => {
    const row = model.rows.findLast((candidate) => candidate[series.key] !== undefined);
    return row === undefined
      ? []
      : [
          {
            id: `${series.key}:latest`,
            name: `${series.label} latest sample`,
            type: "scatter" as const,
            data: [[row.atMs, row[series.key]]],
            yAxisIndex: model.axes.findIndex((axis) => axis.id === series.axis),
            symbolSize: model.compact ? 5 : 7,
            silent: true,
            clip: false,
            tooltip: { show: false },
            itemStyle: {
              color: series.color,
              borderColor: colorValues.surface,
              borderWidth: 2,
              shadowBlur: 7,
              shadowColor: series.color,
            },
            z: 4,
          },
        ];
  });

  return {
    animation: !reducedMotion,
    aria: { enabled: true, description: accessibleName },
    backgroundColor: "transparent",
    grid: model.compact
      ? { bottom: 4, containLabel: false, left: 2, right: 2, top: 8 }
      : {
          bottom: 28,
          containLabel: false,
          left: 58,
          right: model.axes.length > 1 ? 54 : 20,
          top: 18,
        },
    tooltip: {
      trigger: "axis",
      confine: true,
      appendToBody: false,
      axisPointer: { type: "line", lineStyle: { color: colorValues.lineStrong, width: 1 } },
      backgroundColor: "rgba(20, 18, 16, 0.96)",
      borderColor: colorValues.lineStrong,
      borderWidth: 1,
      padding: [9, 11],
      textStyle: { color: colorValues.text, fontFamily: "IBM Plex Sans", fontSize: 12 },
    },
    xAxis: {
      type: "time",
      min: model.timeDomain[0],
      max: model.timeDomain[1],
      boundaryGap: false,
      axisLine: { lineStyle: { color: colorValues.line } },
      axisTick: { show: false },
      axisLabel: {
        color: colorValues.textSubtle,
        fontFamily: "IBM Plex Mono",
        fontSize: 10,
        hideOverlap: true,
        formatter: (value: number) =>
          value >= model.timeDomain[1] - 500 ? "Now" : shortTime(value),
      },
      splitLine: { show: false },
      show: !model.compact,
    },
    yAxis: model.axes.map((axis) => ({
      type: axis.scale === "log" ? "log" : "value",
      position: axis.id,
      min: model.stacking === "percent" ? 0 : numericDomain(model.axisDomains[axis.id][0]),
      max: model.stacking === "percent" ? 1 : numericDomain(model.axisDomains[axis.id][1]),
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: colorValues.textSubtle,
        fontFamily: "IBM Plex Mono",
        fontSize: 10,
        formatter: (value: number) =>
          model.stacking === "percent"
            ? `${Math.round(value * 100)}%`
            : formatPanelAxisValue(value, axis.unit, model.resolvedUnits[axis.id]),
      },
      splitLine: {
        show: axis.showGrid !== false && axis.id === model.gridAxisId,
        lineStyle: { color: colorValues.line, opacity: 0.65, width: 1 },
      },
      show: !model.compact,
    })),
    series: [...primarySeries, ...latestPoints],
  };
};

const numericDomain = (value: number | "auto") => (value === "auto" ? undefined : value);

const formatTooltipValue = (
  value: unknown,
  unit: Parameters<typeof formatPanelValue>[1] | undefined,
  resolvedUnit: string | undefined,
) => {
  const candidate = Array.isArray(value) ? value.at(-1) : value;
  return typeof candidate === "number" && unit !== undefined
    ? formatPanelValue(candidate, unit, resolvedUnit)
    : String(candidate ?? "No data");
};

const shortTime = (value: number) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).format(value);

function AxisCaptions({ model }: { readonly model: ReturnType<typeof buildMetricChartModel> }) {
  return (
    <div aria-hidden {...stylex.props(styles.axisCaptions)}>
      {model.axes.map((axis) => {
        const unit = panelAxisCaption(axis.unit, model.resolvedUnits[axis.id]);
        const caption = [axis.label, unit].filter(Boolean).join(" · ");
        return caption ? (
          <span
            key={axis.id}
            {...stylex.props(styles.axisCaption, axis.id === "right" && styles.rightAxisCaption)}
          >
            {caption}
          </span>
        ) : null;
      })}
    </div>
  );
}

const styles = stylex.create({
  figure: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    margin: 0,
    minHeight: 250,
    width: "100%",
  },
  compactFigure: { minHeight: 100 },
  chartCanvas: { flex: 1, minHeight: 220, minWidth: 0, width: "100%" },
  axisCaptions: {
    alignItems: "center",
    color: colors.textMuted,
    display: "flex",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    gap: 12,
    justifyContent: "space-between",
    lineHeight: 1.4,
    minHeight: 16,
    paddingInline: 58,
  },
  axisCaption: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rightAxisCaption: { textAlign: "right" },
  invalidScale: {
    alignItems: "center",
    color: colors.textMuted,
    display: "flex",
    fontSize: 12,
    height: "100%",
    justifyContent: "center",
    minHeight: 180,
    padding: 24,
    textAlign: "center",
  },
  screenReaderOnly: {
    clip: "rect(0, 0, 0, 0)",
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});
