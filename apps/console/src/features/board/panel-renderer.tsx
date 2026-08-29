import type { PanelView } from "@groundtruth/api-contract";
import type {
  Axis,
  StatPanel as StatPanelSpec,
  TableColumn,
  TablePanel as TablePanelSpec,
} from "@groundtruth/panel-dsl";
import type { MetricCatalogEntry } from "@groundtruth/telemetry";
import * as stylex from "@stylexjs/stylex";

import { epochMilliseconds, errorMessage, formatEpochShortTime } from "../../data/format";
import { type PanelSeries, usePanelSeries } from "../../data/panels";
import { colors, space } from "../../theme/tokens.stylex";
import { ContentState } from "../../ui/page";
import { MetricChart } from "../overview/metric-chart";
import { activeThreshold, formatPanelValue, reducePanelValues } from "./panel-format";
import { buildChartLegend } from "./panel-legend";
import { PanelCard } from "./panel-card";
import { buildPanelTableRows, tableCellValue } from "./panel-table";

export function LivePanel({
  catalog,
  fullWidth,
  panel,
}: {
  catalog: ReadonlyArray<MetricCatalogEntry>;
  fullWidth: boolean;
  panel: PanelView;
}) {
  const data = usePanelSeries(panel);
  const unitResolution = resolvePanelUnits(panel, catalog);
  const values = data.results.flatMap((item) => item.points.map((point) => point.value));
  const latest = data.results[0]?.points
    .toSorted((left, right) => epochMilliseconds(right.at) - epochMilliseconds(left.at))
    .at(0)?.value;
  const panelValue =
    panel.spec._tag === "stat"
      ? reducePanelValues(values, panel.spec.reduction)
      : data.results.length === 1
        ? latest
        : undefined;
  const footer = data.error
    ? errorMessage(data.error)
    : (unitResolution.error ?? data.hints[0] ?? panel.annotations.at(-1)?.label);

  return (
    <PanelCard
      description={panel.spec.description ?? "Live metric query"}
      footer={footer}
      fullWidth={fullWidth}
      legend={
        panel.spec._tag === "metric-chart"
          ? buildChartLegend(panel.spec, data.results, unitResolution.units)
          : []
      }
      legendPlacement={
        panel.spec._tag === "metric-chart" ? panel.spec.legend?.placement : undefined
      }
      title={panel.spec.title}
      value={
        panel.spec._tag === "metric-chart" && panelValue !== undefined
          ? formatPanelValue(
              panelValue,
              panel.spec.axes.find((axis) => axis.id === data.results[0]?.axis)?.unit ?? {
                _tag: "auto",
              },
              unitResolution.units[data.results[0]?.axis ?? "left"],
            )
          : undefined
      }
    >
      <PanelContent
        catalog={catalog}
        data={data}
        panel={panel}
        unitError={unitResolution.error}
        units={unitResolution.units}
      />
    </PanelCard>
  );
}

function PanelContent({
  catalog,
  data,
  panel,
  unitError,
  units,
}: {
  catalog: ReadonlyArray<MetricCatalogEntry>;
  data: ReturnType<typeof usePanelSeries>;
  panel: PanelView;
  unitError: string | null;
  units: Readonly<Partial<Record<"left" | "right", string>>>;
}) {
  if (data.pending) return <ContentState kind="loading" title="Loading panel data" />;
  if (data.error) {
    return (
      <ContentState kind="error" title="Panel data is unavailable">
        {errorMessage(data.error)}
      </ContentState>
    );
  }
  if (unitError !== null) {
    return (
      <ContentState kind="error" title="Panel units are ambiguous">
        {unitError}
      </ContentState>
    );
  }
  if (panel.spec._tag === "stat") {
    if (data.results.length === 0) return <ContentState title="No data in this window" />;
    return <StatPanel catalog={catalog} series={data.results} spec={panel.spec} />;
  }
  if (panel.spec._tag === "table") {
    if (data.results.length === 0) return <ContentState title="No data in this window" />;
    return <TablePanel series={data.results} spec={panel.spec} />;
  }
  const spec = panel.spec;
  if (spec.visualization === "heatmap") {
    return (
      <ContentState kind="error" title="Heatmap data is unavailable">
        Heatmaps require bucket boundaries and counts. The metric query API currently returns only
        aggregated time series, so Clear will not substitute a misleading line chart.
      </ContentState>
    );
  }
  if (data.results.length === 0) return <ContentState title="No data in this window" />;
  if (
    spec.stacking === "percent" &&
    data.results.some((series) => series.points.some((point) => point.value < 0))
  ) {
    return (
      <ContentState kind="error" title="Percent stacking requires positive values">
        This panel includes negative samples, which cannot be represented honestly as a share of the
        total.
      </ContentState>
    );
  }
  const annotations = [
    ...(spec.annotations ?? []),
    ...panel.annotations.map((annotation) => ({
      _tag: annotation._tag,
      atMs: epochMilliseconds(annotation.at),
      label: annotation.label,
    })),
  ];
  return (
    <MetricChart
      accessibleName={spec.title}
      annotations={annotations}
      axes={spec.axes}
      resolvedUnits={units}
      series={data.results}
      stacking={spec.stacking}
      summary={chartSummary(spec.title, data.results, spec.axes, units)}
      thresholds={spec.thresholds}
      visualization={spec.visualization}
    />
  );
}

function StatPanel({
  catalog,
  series,
  spec,
}: {
  catalog: ReadonlyArray<MetricCatalogEntry>;
  series: ReadonlyArray<PanelSeries>;
  spec: StatPanelSpec;
}) {
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const value = reducePanelValues(values, spec.reduction);
  const resolvedUnit = catalog.find((entry) => entry.name === spec.query.metric)?.unit;
  const threshold = value === undefined ? undefined : activeThreshold(value, spec.thresholds);
  const axis: Axis = { id: "left", unit: spec.unit };
  return (
    <div {...stylex.props(styles.statPanel)}>
      <div {...stylex.props(styles.statReading)}>
        <strong
          {...stylex.props(
            styles.statValue,
            threshold?.severity === "critical" && styles.statCritical,
            threshold?.severity === "warning" && styles.statWarning,
            threshold?.severity === "info" && styles.statInfo,
          )}
        >
          {value === undefined ? "No value" : formatPanelValue(value, spec.unit, resolvedUnit)}
        </strong>
        {threshold ? (
          <span {...stylex.props(styles.thresholdLabel)}>
            {threshold.label ?? `${threshold.severity} threshold`}
          </span>
        ) : null}
      </div>
      {spec.sparkline ? (
        <MetricChart
          accessibleName={`${spec.title} trend`}
          axes={[axis]}
          compact
          resolvedUnits={{ left: resolvedUnit }}
          series={series.slice(0, 1)}
          summary={chartSummary(spec.title, series.slice(0, 1), [axis], {
            left: resolvedUnit,
          })}
          visualization="line"
        />
      ) : null}
    </div>
  );
}

function TablePanel({
  series,
  spec,
}: {
  series: ReadonlyArray<PanelSeries>;
  spec: TablePanelSpec;
}) {
  const rows = buildPanelTableRows(spec, series);
  return (
    <div {...stylex.props(styles.tableScroller)}>
      <table {...stylex.props(styles.table)}>
        <colgroup>
          {spec.columns.map((column) => (
            <col key={column.id} style={{ width: column.width ?? 160 }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {spec.columns.map((column) => (
              <th aria-sort={sortDirection(spec.sort, column)} key={column.id} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {spec.columns.map((column) => (
                <TableCell column={column} key={column.id} row={row} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableCell({
  column,
  row,
}: {
  column: TableColumn;
  row: ReturnType<typeof buildPanelTableRows>[number];
}) {
  const value = tableCellValue(column, row);
  const content =
    value === null
      ? "n/a"
      : column._tag === "time" && typeof value === "number"
        ? formatEpochShortTime(value)
        : column._tag === "value" && typeof value === "number"
          ? formatPanelValue(value, column.unit)
          : String(value);
  return (
    <td
      {...stylex.props(
        styles.tableCell,
        column._tag === "value" && styles.tableValue,
        column._tag === "value" && column.color && cellColorStyles[column.color],
      )}
    >
      {content}
    </td>
  );
}

const chartSummary = (
  title: string,
  series: ReadonlyArray<PanelSeries>,
  axes: ReadonlyArray<Axis>,
  units: Readonly<Partial<Record<"left" | "right", string>>>,
) => {
  const readings = series.map((item) => {
    const value = item.points.at(-1)?.value;
    const axis = axes.find((candidate) => candidate.id === item.axis)!;
    return value === undefined
      ? `${item.label} has no values`
      : `${item.label} last value ${formatPanelValue(value, axis.unit, units[item.axis])}`;
  });
  return `${title}. ${readings.join(". ")}.`;
};

const resolvePanelUnits = (panel: PanelView, catalog: ReadonlyArray<MetricCatalogEntry>) => {
  if (panel.spec._tag !== "metric-chart") return { error: null, units: {} };
  const units: Partial<Record<"left" | "right", string>> = {};
  for (const axis of panel.spec.axes) {
    if (axis.unit._tag !== "auto") continue;
    const candidates = new Set(
      panel.spec.queries
        .filter((query) => query.axis === axis.id)
        .map((query) => catalog.find((entry) => entry.name === query.metric)?.unit)
        .filter((unit): unit is string => unit !== undefined),
    );
    if (candidates.size > 1) {
      return {
        error: `${axis.id} axis uses auto units across metrics with incompatible reported units. Set an explicit axis unit.`,
        units,
      };
    }
    units[axis.id] = [...candidates][0];
  }
  return { error: null, units };
};

const sortDirection = (sort: TablePanelSpec["sort"], column: TableColumn) =>
  sort?.columnId === column.id ? (sort.direction === "asc" ? "ascending" : "descending") : "none";

const cellColorStyles = stylex.create({
  amber: { color: colors.amber },
  blue: { color: colors.blue },
  cyan: { color: colors.cyan },
  gray: { color: colors.textMuted },
  green: { color: colors.green },
  orange: { color: colors.orange },
  red: { color: colors.red },
  violet: { color: colors.violet },
});

const styles = stylex.create({
  statPanel: {
    alignItems: "center",
    display: "grid",
    gap: space.x5,
    gridTemplateColumns: { default: "minmax(160px, auto) 1fr", "@media (max-width: 620px)": "1fr" },
    height: "100%",
  },
  statReading: { display: "grid", gap: space.x2 },
  statValue: { fontFamily: "IBM Plex Mono, monospace", fontSize: 36, fontWeight: 500 },
  statCritical: { color: colors.red },
  statWarning: { color: colors.amber },
  statInfo: { color: colors.blue },
  thresholdLabel: { color: colors.textMuted, fontSize: 11 },
  tableScroller: { height: "100%", overflow: "auto" },
  table: { borderCollapse: "collapse", minWidth: "100%", tableLayout: "fixed" },
  tableCell: {
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: colors.textMuted,
    fontSize: 11,
    overflow: "hidden",
    paddingBlock: space.x2,
    paddingInline: space.x3,
    textAlign: "left",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tableValue: { fontFamily: "IBM Plex Mono, monospace" },
});
