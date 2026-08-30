import * as stylex from "@stylexjs/stylex";
import { useId } from "react";
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
import { formatPanelValue } from "../board/panel-format";
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

export function MetricChart({ accessibleName, summary, ...input }: MetricChartProps) {
  const descriptionId = useId();
  const model = buildMetricChartModel(input);
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
      <ResponsiveContainer
        height="100%"
        minHeight={model.compact ? 100 : 240}
        minWidth={0}
        width="100%"
      >
        <ComposedChart
          accessibilityLayer
          data={model.rows}
          margin={model.compact ? compactMargin : chartMargin}
        >
          <CartesianGrid horizontal stroke={colors.line} strokeOpacity={0.62} vertical={false} />
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
              allowDataOverflow={axis.minimum !== undefined || axis.maximum !== undefined}
              axisLine={false}
              domain={
                model.stacking === "percent"
                  ? [0, 1]
                  : [axis.minimum ?? "auto", axis.maximum ?? "auto"]
              }
              hide={model.compact}
              key={axis.id}
              orientation={axis.id}
              scale={axis.scale === "log" ? "log" : "auto"}
              tick={axisTick}
              tickFormatter={(value: number) =>
                model.stacking === "percent"
                  ? `${Math.round(value * 100)}%`
                  : formatPanelValue(value, axis.unit, model.resolvedUnits[axis.id])
              }
              tickLine={false}
              tickMargin={axis.id === "left" ? 10 : 8}
              width={model.compact ? 0 : axis.id === "left" ? 74 : 62}
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
                  label={{
                    fill: severityColors[threshold.severity],
                    fontSize: 10,
                    position: "insideTopRight",
                    value: threshold.label ?? threshold.severity,
                  }}
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
                  label={{
                    angle: -90,
                    fill: annotation._tag === "deploy" ? colors.amber : colors.blue,
                    fontSize: 10,
                    offset: 8,
                    position: "insideTopLeft",
                    value: annotation.label,
                  }}
                  stroke={annotation._tag === "deploy" ? colors.amber : colors.blue}
                  strokeDasharray="4 4"
                  strokeOpacity={0.72}
                  x={annotation.atMs}
                />
              ))}
          {model.series.map((series) => {
            const common = {
              activeDot: { fill: series.color, r: 4, stroke: colors.surface, strokeWidth: 2 },
              dataKey: series.key,
              isAnimationActive: false,
              key: series.key,
              name: series.label,
              stackId: series.stackId,
              stroke: series.color,
              strokeDasharray: series.lineStyle === "dashed" ? "6 5" : undefined,
              strokeWidth: 2,
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
                  fill={series.color}
                  fillOpacity={series.fillOpacity}
                />
              );
            }
            return <Line {...common} connectNulls={false} dot={false} />;
          })}
        </ComposedChart>
      </ResponsiveContainer>
      <figcaption id={descriptionId} {...stylex.props(styles.screenReaderOnly)}>
        {summary}
      </figcaption>
    </figure>
  );
}

const axisTick = {
  fill: "#918a84",
  fontFamily: "IBM Plex Mono, monospace",
  fontSize: 10,
};

const chartMargin = { bottom: 2, left: 4, right: 4, top: 20 } as const;
const compactMargin = { bottom: 2, left: 2, right: 2, top: 8 } as const;

const styles = stylex.create({
  figure: { height: "100%", margin: 0, minHeight: 240, width: "100%" },
  compactFigure: { minHeight: 100 },
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
