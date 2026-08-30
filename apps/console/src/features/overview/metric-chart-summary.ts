import type { Axis, ChartThreshold } from "@groundtruth/panel-dsl";

import { formatEpochShortTime } from "../../data/format";
import type { PanelSeries } from "../../data/panels";
import { formatPanelValue } from "../board/panel-format";
import type { RenderAnnotation } from "./metric-chart-model";

export const buildMetricChartSummary = ({
  annotations = [],
  axes,
  series,
  thresholds = [],
  title,
  units,
}: {
  readonly annotations?: ReadonlyArray<RenderAnnotation>;
  readonly axes: ReadonlyArray<Axis>;
  readonly series: ReadonlyArray<PanelSeries>;
  readonly thresholds?: ReadonlyArray<ChartThreshold>;
  readonly title: string;
  readonly units: Readonly<Partial<Record<"left" | "right", string>>>;
}) => {
  const readings = series.map((item) => {
    const value = item.points.at(-1)?.value;
    const axis = axes.find((candidate) => candidate.id === item.axis);
    if (value === undefined) return `${item.label} has no values`;
    return `${item.label} last value ${formatPanelValue(
      value,
      axis?.unit ?? { _tag: "auto" },
      units[item.axis],
    )}`;
  });
  const thresholdSummary = thresholds.map((threshold) => {
    const axis = axes.find((candidate) => candidate.id === threshold.axis);
    const value = formatPanelValue(
      threshold.value,
      axis?.unit ?? { _tag: "auto" },
      units[threshold.axis],
    );
    return `${threshold.label ?? threshold.severity} at ${value}`;
  });
  const annotationSummary = annotations.map(
    (annotation) =>
      `${annotation._tag === "deploy" ? "Deploy" : "Note"} ${annotation.label} at ${formatEpochShortTime(annotation.atMs)}`,
  );
  return [
    title,
    ...readings,
    thresholdSummary.length > 0 ? `Thresholds: ${thresholdSummary.join(", ")}` : null,
    annotationSummary.length > 0 ? `Annotations: ${annotationSummary.join(", ")}` : null,
  ]
    .filter((sentence): sentence is string => sentence !== null)
    .map((sentence) => `${sentence}.`)
    .join(" ");
};
