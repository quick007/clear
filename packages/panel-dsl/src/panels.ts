import { Schema } from "effect";
import {
  AttributeKey,
  ColumnId,
  Label,
  PaletteColor,
  PanelDescription,
  PanelTitle,
  QueryRef,
  SchemaVersion,
} from "./primitives.ts";
import {
  Axis,
  ChartThreshold,
  DisplayUnit,
  Legend,
  PanelAnnotation,
  ValueThreshold,
} from "./presentation.ts";
import { ChartQuery, MetricQuery } from "./query.ts";

const panelFields = {
  version: SchemaVersion,
  title: PanelTitle,
  description: Schema.optionalKey(PanelDescription),
  annotations: Schema.optionalKey(Schema.Array(PanelAnnotation).check(Schema.isMaxLength(32))),
} as const;

const uniqueFieldIssues = <T>(values: ReadonlyArray<T>, field: keyof T, path: PropertyKey) => {
  const seen = new Set<unknown>();
  const issues: Array<Schema.FilterIssue> = [];
  values.forEach((value, index) => {
    const candidate = value[field];
    if (seen.has(candidate)) {
      issues.push({ path: [path, index, field], issue: `${String(field)} must be unique` });
    }
    seen.add(candidate);
  });
  return issues;
};

const MetricChartPanelBase = Schema.TaggedStruct("metric-chart", {
  ...panelFields,
  visualization: Schema.Literals(["line", "area", "bar", "heatmap"]),
  queries: Schema.NonEmptyArray(ChartQuery).check(Schema.isMaxLength(4)),
  axes: Schema.NonEmptyArray(Axis).check(Schema.isMaxLength(2)),
  stacking: Schema.optionalKey(Schema.Literals(["none", "normal", "percent"])),
  legend: Schema.optionalKey(Legend),
  thresholds: Schema.optionalKey(Schema.Array(ChartThreshold).check(Schema.isMaxLength(8))),
});

export const MetricChartPanel = MetricChartPanelBase.check(
  Schema.makeFilter<typeof MetricChartPanelBase.Type>((panel) => {
    const issues = [
      ...uniqueFieldIssues(panel.queries, "refId", "queries"),
      ...uniqueFieldIssues(panel.axes, "id", "axes"),
    ];
    const axisIds = new Set(panel.axes.map((axis) => axis.id));

    panel.queries.forEach((query, index) => {
      if (!axisIds.has(query.axis)) {
        issues.push({
          path: ["queries", index, "axis"],
          issue: `query axis ${query.axis} is not declared by this panel`,
        });
      }
    });
    panel.thresholds?.forEach((threshold, index) => {
      if (!axisIds.has(threshold.axis)) {
        issues.push({
          path: ["thresholds", index, "axis"],
          issue: `threshold axis ${threshold.axis} is not declared by this panel`,
        });
      }
    });
    if (panel.visualization === "heatmap" && panel.queries.length !== 1) {
      issues.push({
        path: ["queries"],
        issue: "a heatmap must contain exactly one metric query",
      });
    }
    if (
      panel.stacking === "percent" &&
      panel.visualization !== "area" &&
      panel.visualization !== "bar"
    ) {
      issues.push({
        path: ["stacking"],
        issue: "percent stacking is supported only by area and bar charts",
      });
    }
    return issues;
  }),
).pipe(
  Schema.annotate({
    identifier: "MetricChartPanel",
    description: "A time-series chart backed by one to four metric queries.",
  }),
);
export type MetricChartPanel = typeof MetricChartPanel.Type;

const StatPanelBase = Schema.TaggedStruct("stat", {
  ...panelFields,
  query: MetricQuery,
  reduction: Schema.Literals(["last", "min", "max", "avg", "sum", "count"]),
  unit: DisplayUnit,
  thresholds: Schema.optionalKey(Schema.Array(ValueThreshold).check(Schema.isMaxLength(8))),
  sparkline: Schema.optionalKey(Schema.Boolean),
});

export const StatPanel = StatPanelBase.check(
  Schema.makeFilter<typeof StatPanelBase.Type>((panel) =>
    panel.query.groupBy === undefined
      ? undefined
      : { path: ["query", "groupBy"], issue: "a stat panel query cannot be grouped" },
  ),
).pipe(
  Schema.annotate({
    identifier: "StatPanel",
    description: "A single reduced metric value with optional thresholds and sparkline.",
  }),
);
export type StatPanel = typeof StatPanel.Type;

export const TimeColumn = Schema.TaggedStruct("time", {
  id: ColumnId,
  label: Label,
  width: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 80, maximum: 480 }))),
}).pipe(
  Schema.annotate({
    identifier: "TimeColumn",
    description: "Displays each row's metric bucket timestamp.",
  }),
);
export type TimeColumn = typeof TimeColumn.Type;

export const AttributeColumn = Schema.TaggedStruct("attribute", {
  id: ColumnId,
  attribute: AttributeKey,
  label: Label,
  width: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 80, maximum: 480 }))),
}).pipe(
  Schema.annotate({
    identifier: "AttributeColumn",
    description: "Displays one grouped OpenTelemetry attribute.",
  }),
);
export type AttributeColumn = typeof AttributeColumn.Type;

export const ValueColumn = Schema.TaggedStruct("value", {
  id: ColumnId,
  queryRef: QueryRef,
  label: Label,
  unit: DisplayUnit,
  color: Schema.optionalKey(PaletteColor),
  width: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 80, maximum: 480 }))),
}).pipe(
  Schema.annotate({
    identifier: "ValueColumn",
    description: "Displays the value produced by one table query.",
  }),
);
export type ValueColumn = typeof ValueColumn.Type;

export const TableColumn = Schema.Union([TimeColumn, AttributeColumn, ValueColumn]).pipe(
  Schema.annotate({
    identifier: "TableColumn",
    description: "A typed metric-table column.",
  }),
);
export type TableColumn = typeof TableColumn.Type;

export const TableSort = Schema.Struct({
  columnId: ColumnId,
  direction: Schema.Literals(["asc", "desc"]),
}).pipe(
  Schema.annotate({
    identifier: "TableSort",
    description: "The initial deterministic table sort.",
  }),
);
export type TableSort = typeof TableSort.Type;

const TablePanelBase = Schema.TaggedStruct("table", {
  ...panelFields,
  queries: Schema.NonEmptyArray(MetricQuery).check(Schema.isMaxLength(4)),
  columns: Schema.NonEmptyArray(TableColumn).check(Schema.isMaxLength(12)),
  sort: Schema.optionalKey(TableSort),
  rowLimit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 })),
});

export const TablePanel = TablePanelBase.check(
  Schema.makeFilter<typeof TablePanelBase.Type>((panel) => {
    const issues = [
      ...uniqueFieldIssues(panel.queries, "refId", "queries"),
      ...uniqueFieldIssues(panel.columns, "id", "columns"),
    ];
    const queryRefs = new Set(panel.queries.map((query) => query.refId));
    const columnIds = new Set(panel.columns.map((column) => column.id));

    panel.columns.forEach((column, index) => {
      if (column._tag === "value" && !queryRefs.has(column.queryRef)) {
        issues.push({
          path: ["columns", index, "queryRef"],
          issue: `query ${column.queryRef} is not declared by this panel`,
        });
      }
    });
    if (panel.sort !== undefined && !columnIds.has(panel.sort.columnId)) {
      issues.push({
        path: ["sort", "columnId"],
        issue: `sort column ${panel.sort.columnId} is not declared by this panel`,
      });
    }
    return issues;
  }),
).pipe(
  Schema.annotate({
    identifier: "TablePanel",
    description: "A bounded table that combines metric query values and grouped attributes.",
  }),
);
export type TablePanel = typeof TablePanel.Type;

export const PanelSpec = Schema.Union([MetricChartPanel, StatPanel, TablePanel]).pipe(
  Schema.annotate({
    identifier: "PanelSpec",
    title: "Clear panel",
    description: "A versioned metric chart, stat, or table panel specification.",
  }),
);
export type PanelSpec = typeof PanelSpec.Type;
