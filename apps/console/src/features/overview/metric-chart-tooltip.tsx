import * as stylex from "@stylexjs/stylex";
import type { TooltipContentProps, TooltipValueType } from "recharts";

import { formatEpochShortTime } from "../../data/format";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { formatPanelValue } from "../board/panel-format";
import type { MetricChartModel } from "./metric-chart-model";

export function MetricChartTooltip({
  active,
  label,
  model,
  payload,
}: TooltipContentProps<TooltipValueType, string | number> & { readonly model: MetricChartModel }) {
  if (!active || typeof label !== "number" || payload.length === 0) return null;
  const descriptors = new Map(model.series.map((series) => [series.key, series]));
  const values = payload.flatMap((entry) => {
    if (typeof entry.dataKey !== "string" || typeof entry.value !== "number") return [];
    const descriptor = descriptors.get(entry.dataKey);
    const axis = model.axes.find((candidate) => candidate.id === descriptor?.axis);
    if (!descriptor || !axis) return [];
    return [
      {
        color: descriptor.color,
        key: descriptor.key,
        label: descriptor.label,
        lineStyle: descriptor.lineStyle,
        value:
          model.stacking === "percent"
            ? `${(entry.value * 100).toFixed(1)}%`
            : formatPanelValue(entry.value, axis.unit, model.resolvedUnits[descriptor.axis]),
      },
    ];
  });
  if (values.length === 0) return null;

  return (
    <div {...stylex.props(styles.tooltip)}>
      <time {...stylex.props(styles.time)}>{formatEpochShortTime(label)}</time>
      <div {...stylex.props(styles.values)}>
        {values.map((entry) => (
          <div key={entry.key} {...stylex.props(styles.row)}>
            <span
              aria-hidden
              style={{ borderTopColor: entry.color }}
              {...stylex.props(styles.swatch, entry.lineStyle === "dashed" && styles.swatchDashed)}
            />
            <span {...stylex.props(styles.label)}>{entry.label}</span>
            <strong {...stylex.props(styles.value)}>{entry.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = stylex.create({
  tooltip: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 14px 36px rgba(0, 0, 0, 0.28)",
    maxWidth: "calc(100vw - 48px)",
    minWidth: { default: 220, "@media (max-width: 520px)": 160 },
    padding: space.x3,
  },
  time: {
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: colors.textMuted,
    display: "block",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    paddingBottom: space.x2,
  },
  values: { display: "grid", gap: space.x2, marginTop: space.x2 },
  row: {
    alignItems: "center",
    display: "grid",
    gap: space.x2,
    gridTemplateColumns: "14px minmax(0, 1fr) auto",
  },
  swatch: {
    borderRadius: radii.pill,
    borderTopStyle: "solid",
    borderTopWidth: 2,
    height: 0,
    width: 14,
  },
  swatchDashed: { borderTopStyle: "dashed" },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  value: {
    color: colors.text,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 11,
    fontWeight: 500,
  },
});
