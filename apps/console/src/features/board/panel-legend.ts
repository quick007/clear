import type { MetricChartPanel } from "@groundtruth/panel-dsl";

import type { PanelSeries } from "../../data/panels";
import { formatPanelValue, summarizeValues } from "./panel-format";

export const buildChartLegend = (
  spec: MetricChartPanel,
  series: ReadonlyArray<PanelSeries>,
  units: Readonly<Partial<Record<"left" | "right", string>>>,
) => {
  const legend = spec.legend;
  if (legend?.visibility === "hidden") return [];
  if (legend?.visibility === "auto" && series.length < 2) return [];
  if (legend === undefined && series.length < 2) return [];
  return series.map((item) => {
    const axis = spec.axes.find((candidate) => candidate.id === item.axis)!;
    const summaries = summarizeValues(
      item.points.map((point) => point.value),
      legend?.values ?? [],
    ).map((summary) => ({
      label: summary.label,
      value: formatPanelValue(summary.value, axis.unit, units[item.axis]),
    }));
    return {
      dashed: item.lineStyle === "dashed",
      label: item.label,
      summaries,
      tone: item.tone,
    };
  });
};
