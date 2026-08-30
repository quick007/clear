import type { MetricChartPanel } from "@groundtruth/panel-dsl";

import type { PanelSeries } from "../../data/panels";

export const chartNeedsFullWidth = (panel: MetricChartPanel) =>
  panel.queries.length > 1 || panel.queries.some((query) => query.groupBy !== undefined);

export const hasRenderableChartPoints = (series: ReadonlyArray<PanelSeries>) =>
  series.some((item) => item.points.length > 0);
