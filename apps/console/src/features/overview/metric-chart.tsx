import * as stylex from "@stylexjs/stylex";
import { useId, useSyncExternalStore } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatEpochShortTime } from "../../data/format";
import { colors } from "../../theme/tokens.stylex";
import {
  formatPanelAxisValue,
  panelAxisAllowsDecimals,
  panelAxisCaption,
} from "../board/panel-format";
import { buildMetricChartModel, type MetricChartModelInput } from "./metric-chart-model";
import { MetricChartTooltip } from "./metric-chart-tooltip";

type MetricChartProps = MetricChartModelInput & {
  readonly accessibleName: string;
  readonly summary: string;
};

const severityColors = {
  critical: "#f87171",
  info: "#38bdf8",
  warning: "#fbbf24",
} as const;
const severityRank = { critical: 3, warning: 2, info: 1 } as const;

export function MetricChart({ accessibleName, summary, ...input }: MetricChartProps) {
  const descriptionId = useId();
  const gradientPrefix = useId().replaceAll(":", "");
  const narrow = useSyncExternalStore(subscribeNarrowViewport, narrowViewport, () => false);
  const model = buildMetricChartModel(input);
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
  if (model.invalidLogAxis) {
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
      <div {...stylex.props(styles.chartCanvas)}>
        <ResponsiveContainer
          height="100%"
          minHeight={model.compact ? 100 : 220}
          minWidth={0}
          width="100%"
        >
          <ComposedChart
            accessibilityLayer
            data={model.rows}
            margin={model.compact ? compactMargin : chartMargin}
          >
            {model.visualization === "area" ? (
              <defs>
                {model.series.map((series) => (
                  <linearGradient
                    id={`${gradientPrefix}-${series.key}`}
                    key={series.key}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={series.color} stopOpacity={series.fillOpacity} />
                    <stop offset="100%" stopColor={series.color} stopOpacity={0.025} />
                  </linearGradient>
                ))}
              </defs>
            ) : null}
            {model.gridAxisId ? (
              <CartesianGrid
                horizontal
                stroke={colors.lineStrong}
                strokeDasharray="2 5"
                strokeOpacity={0.38}
                vertical={false}
                yAxisId={model.gridAxisId}
              />
            ) : null}
            <XAxis
              axisLine={false}
              dataKey="atMs"
              domain={model.timeDomain}
              hide={model.compact}
              minTickGap={36}
              scale="time"
              tick={axisTick}
              tickFormatter={formatEpochShortTime}
              tickLine={false}
              tickMargin={11}
              type="number"
            />
            {model.axes.map((axis) => (
              <YAxis
                allowDecimals={model.stacking === "percent" || panelAxisAllowsDecimals(axis.unit)}
                allowDataOverflow={axis.minimum !== undefined || axis.maximum !== undefined}
                axisLine={false}
                domain={model.stacking === "percent" ? [0, 1] : model.axisDomains[axis.id]}
                hide={model.compact}
                key={axis.id}
                orientation={axis.id}
                scale={axis.scale === "log" ? "log" : "auto"}
                tick={narrow ? narrowAxisTick : axisTick}
                tickFormatter={(value: number) =>
                  model.stacking === "percent"
                    ? `${Math.round(value * 100)}%`
                    : formatPanelAxisValue(value, axis.unit, model.resolvedUnits[axis.id])
                }
                tickLine={false}
                ticks={model.stacking === "percent" ? percentTicks : model.axisTicks[axis.id]}
                tickMargin={narrow ? 4 : axis.id === "left" ? 10 : 8}
                width={
                  model.compact
                    ? 0
                    : narrow
                      ? axis.id === "left"
                        ? 46
                        : 36
                      : axis.id === "left"
                        ? 64
                        : 48
                }
                yAxisId={axis.id}
              />
            ))}
            <Tooltip
              content={(tooltip) => <MetricChartTooltip {...tooltip} model={model} />}
              cursor={{ stroke: colors.lineStrong, strokeDasharray: "3 4", strokeWidth: 1 }}
              isAnimationActive={false}
              wrapperStyle={{ outline: "none", zIndex: 4 }}
            />
            {model.compact
              ? null
              : model.thresholds.map((threshold, index) => (
                  <ReferenceLine
                    ifOverflow="extendDomain"
                    key={`${threshold.axis}-${threshold.value}-${index}`}
                    label={
                      labeledThresholds.has(index)
                        ? {
                            fill: severityColors[threshold.severity],
                            fontSize: 10,
                            position: "insideTopRight",
                            value: threshold.label ?? threshold.severity,
                          }
                        : undefined
                    }
                    stroke={severityColors[threshold.severity]}
                    strokeDasharray="4 4"
                    strokeOpacity={0.78}
                    y={threshold.value}
                    yAxisId={threshold.axis}
                  />
                ))}
            {model.compact
              ? null
              : model.annotations.map((annotation, index) => (
                  <ReferenceLine
                    key={`${annotation._tag}-${annotation.atMs}-${index}`}
                    label={
                      labeledAnnotations.has(index)
                        ? {
                            angle: -90,
                            fill: annotation._tag === "deploy" ? colors.amber : colors.blue,
                            fontSize: 10,
                            offset: 8,
                            position: "insideTopLeft",
                            value: annotation.label,
                          }
                        : undefined
                    }
                    stroke={annotation._tag === "deploy" ? colors.amber : colors.blue}
                    strokeDasharray="4 4"
                    strokeOpacity={0.72}
                    x={annotation.atMs}
                  />
                ))}
            {model.series.map((series) => {
              const common = {
                activeDot: {
                  fill: series.color,
                  r: model.compact ? 3.5 : 4.5,
                  stroke: colors.surface,
                  strokeWidth: 2,
                },
                dataKey: series.key,
                isAnimationActive: false,
                key: series.key,
                name: series.label,
                stackId: series.stackId,
                stroke: series.color,
                strokeDasharray: series.lineStyle === "dashed" ? "6 5" : undefined,
                strokeLinecap: "round" as const,
                strokeLinejoin: "round" as const,
                strokeWidth: model.compact ? 1.75 : 2.25,
                type: "linear" as const,
                yAxisId: series.axis,
              };
              if (model.visualization === "bar") {
                return (
                  <Bar
                    dataKey={series.key}
                    fill={series.color}
                    fillOpacity={0.82}
                    isAnimationActive={false}
                    key={series.key}
                    maxBarSize={24}
                    name={series.label}
                    radius={[4, 4, 1, 1]}
                    stackId={series.stackId}
                    yAxisId={series.axis}
                  />
                );
              }
              if (model.visualization === "area") {
                return (
                  <Area
                    {...common}
                    connectNulls={false}
                    dot={false}
                    fill={`url(#${gradientPrefix}-${series.key})`}
                    fillOpacity={1}
                  />
                );
              }
              return <Line {...common} connectNulls={false} dot={false} />;
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption id={descriptionId} {...stylex.props(styles.screenReaderOnly)}>
        {summary}
      </figcaption>
    </figure>
  );
}

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

const axisTick = {
  fill: "#a8a29e",
  fontFamily: "IBM Plex Mono, monospace",
  fontSize: 11,
};
const narrowAxisTick = { ...axisTick, fontSize: 9 };
const percentTicks = [0, 0.25, 0.5, 0.75, 1] as const;

const thresholdLabelBudget = 2;
const annotationLabelBudget = 2;

const narrowViewportQuery = "(max-width: 520px)";
const narrowViewport = () =>
  typeof window !== "undefined" && window.matchMedia(narrowViewportQuery).matches;
const subscribeNarrowViewport = (onChange: () => void) => {
  if (typeof window === "undefined") return () => undefined;
  const query = window.matchMedia(narrowViewportQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const chartMargin = { bottom: 2, left: 4, right: 4, top: 18 } as const;
const compactMargin = { bottom: 2, left: 2, right: 2, top: 8 } as const;

const styles = stylex.create({
  figure: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    margin: 0,
    minHeight: 240,
    width: "100%",
  },
  compactFigure: { minHeight: 100 },
  chartCanvas: { flex: 1, minHeight: 0, minWidth: 0 },
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
    paddingInline: { default: 68, "@media (max-width: 520px)": 48 },
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
