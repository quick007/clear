import {
  MetricChartPanel,
  RequestsVsUsersPanel,
  RetryAmplificationPanel,
  TablePanel,
  UpstreamPressurePanel,
} from "@groundtruth/panel-dsl";
import { MetricSeriesPoint } from "@groundtruth/telemetry";
import { DateTime, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  buildPanelPlans,
  findMissingPanelQueries,
  panelQueryDiagnosis,
  type PanelSeries,
} from "../../data/panels";
import { buildMetricChartModel } from "../overview/metric-chart-model";
import { buildMetricChartSummary } from "../overview/metric-chart-summary";
import { chartNeedsFullWidth, hasRenderableChartPoints } from "./panel-layout";
import { buildChartLegend } from "./panel-legend";
import { buildPanelTableRows, tableCellValue } from "./panel-table";

const at = (iso: string) => DateTime.makeUnsafe(iso);

const series = ({
  axis = "left",
  label,
  queryRef,
  values,
}: {
  axis?: "left" | "right";
  label: string;
  queryRef: PanelSeries["queryRef"];
  values: ReadonlyArray<readonly [string, number]>;
}): PanelSeries => ({
  attributes: {},
  axis,
  color: axis === "left" ? "#fb923c" : "#38bdf8",
  label,
  lineStyle: axis === "left" ? "solid" : "dashed",
  points: values.map(([time, value]) => new MetricSeriesPoint({ at: at(time), value })),
  queryRef,
  tone: axis === "left" ? "orange" : "blue",
});

describe("panel query and chart rendering", () => {
  it("gives grouped evidence charts enough room and detects empty series", () => {
    const empty = series({
      label: "retries",
      queryRef: RetryAmplificationPanel.queries[0].refId,
      values: [],
    });
    expect(chartNeedsFullWidth(RetryAmplificationPanel)).toBe(true);
    expect(hasRenderableChartPoints([empty])).toBe(false);
    expect(
      hasRenderableChartPoints([
        {
          ...empty,
          points: [new MetricSeriesPoint({ at: at("2026-08-28T08:00:00Z"), value: 2 })],
        },
      ]),
    ).toBe(true);
  });

  it("distinguishes a full stale result from an incomplete multi-query panel", () => {
    const plans = buildPanelPlans(RequestsVsUsersPanel.queries).plans;
    const offline = new Error("offline");

    expect(
      findMissingPanelQueries(plans, [
        { data: {}, error: null },
        { data: undefined, error: offline },
      ]),
    ).toEqual([{ label: "Unique users", queryRef: RequestsVsUsersPanel.queries[1]!.refId }]);
    expect(
      findMissingPanelQueries(plans, [
        { data: {}, error: null },
        { data: {}, error: offline },
      ]),
    ).toEqual([]);
  });

  it("keeps the seeded upstream pressure panel on supported exact-match semantics", () => {
    const planning = buildPanelPlans(UpstreamPressurePanel.queries);
    expect(planning.error).toBeNull();
    expect(planning.plans).toHaveLength(2);
    expect(UpstreamPressurePanel.queries[0]).toMatchObject({
      filters: [
        {
          _tag: "match",
          attribute: "http.response.status_code",
          operator: "eq",
          value: 503,
        },
      ],
    });
  });

  it("preserves dual axes and per-query series styles", () => {
    const planning = buildPanelPlans(RequestsVsUsersPanel.queries);
    expect(planning.error).toBeNull();
    expect(planning.plans).toMatchObject([
      { axis: "left", label: "Upstream request rate", tone: "orange" },
      { axis: "right", label: "Unique users", tone: "cyan" },
    ]);

    const chartSeries = [
      series({
        label: "Upstream request rate",
        queryRef: RequestsVsUsersPanel.queries[0].refId,
        values: [["2026-08-28T08:00:00Z", 120]],
      }),
      series({
        axis: "right",
        label: "Unique users",
        queryRef: RequestsVsUsersPanel.queries[1]!.refId,
        values: [["2026-08-28T08:00:00Z", 42]],
      }),
    ];
    expect(
      buildMetricChartModel({
        annotations: [{ _tag: "deploy", atMs: 1_772_176_400_000, label: "release" }],
        axes: RequestsVsUsersPanel.axes,
        series: chartSeries,
        thresholds: [{ axis: "left", value: 100, condition: "above", severity: "warning" }],
        visualization: "line",
      }),
    ).toMatchObject({
      annotations: [{ _tag: "deploy", atMs: 1_772_176_400_000, label: "release" }],
      series: [
        {
          axis: "left",
          lineStyle: "solid",
        },
        { axis: "right", lineStyle: "dashed" },
      ],
      axes: [
        { id: "left", label: "Upstream requests" },
        { id: "right", label: "Unique users" },
      ],
      thresholds: [{ axis: "left", value: 100, severity: "warning" }],
    });
  });

  it("honors area fill, stacking, legend summaries, and bar rendering", () => {
    const attemptSeries = series({
      label: "attempt=2",
      queryRef: RetryAmplificationPanel.queries[0].refId,
      values: [
        ["2026-08-28T08:00:00Z", 10],
        ["2026-08-28T08:01:00Z", 20],
      ],
    });
    expect(
      buildMetricChartModel({
        axes: RetryAmplificationPanel.axes,
        series: [{ ...attemptSeries, fillOpacity: 0.35 }],
        stacking: "normal",
        visualization: "area",
      }),
    ).toMatchObject({
      series: [{ fillOpacity: 0.35, stackId: "panel-left" }],
      visualization: "area",
    });
    expect(
      buildMetricChartModel({
        axes: RetryAmplificationPanel.axes,
        series: [attemptSeries],
        visualization: "bar",
      }),
    ).toMatchObject({ visualization: "bar" });
    const percentModel = buildMetricChartModel({
      axes: RetryAmplificationPanel.axes,
      series: [attemptSeries, { ...attemptSeries, label: "attempt=3" }],
      stacking: "percent",
      visualization: "area",
    });
    expect(percentModel).toMatchObject({
      series: [
        { key: "series-0", stackId: "panel-left" },
        { key: "series-1", stackId: "panel-left" },
      ],
    });
    expect(percentModel.rows).toMatchObject([
      { atMs: expect.any(Number), "series-0": 0.5, "series-1": 0.5 },
      { atMs: expect.any(Number), "series-0": 0.5, "series-1": 0.5 },
    ]);

    const legend = buildChartLegend(
      { ...RequestsVsUsersPanel, legend: { visibility: "always", values: ["last", "max"] } },
      [attemptSeries],
      {},
    );
    expect(legend).toMatchObject([
      {
        label: "attempt=2",
        summaries: [
          { label: "last", value: "20.0 upstream requests/s" },
          { label: "max", value: "20.0 upstream requests/s" },
        ],
      },
    ]);
  });

  it("keeps misaligned timestamps as honest gaps and rejects invalid log values", () => {
    const left = series({
      label: "requests",
      queryRef: RequestsVsUsersPanel.queries[0].refId,
      values: [["2026-08-28T08:00:00Z", 12]],
    });
    const right = series({
      axis: "right",
      label: "users",
      queryRef: RequestsVsUsersPanel.queries[1]!.refId,
      values: [["2026-08-28T08:01:00Z", 8]],
    });
    const model = buildMetricChartModel({
      axes: RequestsVsUsersPanel.axes,
      series: [left, right],
      visualization: "line",
    });
    expect(model.rows).toMatchObject([{ "series-0": 12 }, { "series-1": 8 }]);
    expect(model.rows[0]).not.toHaveProperty("series-1");
    expect(model.rows[1]).not.toHaveProperty("series-0");

    expect(
      buildMetricChartModel({
        axes: [{ id: "left", scale: "log", unit: { _tag: "auto" } }],
        series: [
          {
            ...left,
            points: [new MetricSeriesPoint({ at: at("2026-08-28T08:00:00Z"), value: 0 })],
          },
        ],
        visualization: "line",
      }).invalidLogAxis,
    ).toBe("left");
  });

  it("includes thresholds in the chart domain so quiet baselines retain useful ticks", () => {
    const model = buildMetricChartModel({
      axes: [{ id: "left", minimum: 0, unit: { _tag: "rate", per: "second" } }],
      series: [
        series({
          label: "errors",
          queryRef: UpstreamPressurePanel.queries[0].refId,
          values: [["2026-08-28T08:00:00Z", 0]],
        }),
      ],
      thresholds: [{ axis: "left", condition: "at_or_above", severity: "critical", value: 5 }],
      visualization: "line",
    });

    expect(model.axisDomains.left[0]).toBe(0);
    expect(model.axisDomains.left[1]).toBeGreaterThan(5);
  });

  it("respects grid preferences and rejects nonpositive log thresholds", () => {
    const metricSeries = series({
      label: "latency",
      queryRef: RequestsVsUsersPanel.queries[0].refId,
      values: [["2026-08-28T08:00:00Z", 2]],
    });
    expect(
      buildMetricChartModel({
        axes: [{ id: "left", showGrid: false, unit: { _tag: "auto" } }],
        series: [metricSeries],
        visualization: "line",
      }).gridAxisId,
    ).toBeUndefined();
    expect(
      buildMetricChartModel({
        axes: [{ id: "left", scale: "log", unit: { _tag: "auto" } }],
        series: [metricSeries],
        thresholds: [{ axis: "left", condition: "at_or_above", severity: "warning", value: 0 }],
        visualization: "line",
      }).invalidLogAxis,
    ).toBe("left");
  });

  it("describes thresholds and annotations outside the visual chart", () => {
    const summary = buildMetricChartSummary({
      annotations: [
        { _tag: "note", atMs: Date.parse("2026-08-28T08:00:00Z"), label: "Fix landed" },
      ],
      axes: RequestsVsUsersPanel.axes,
      series: [
        series({
          label: "requests",
          queryRef: RequestsVsUsersPanel.queries[0].refId,
          values: [["2026-08-28T08:00:00Z", 12]],
        }),
      ],
      thresholds: [
        {
          axis: "left",
          condition: "at_or_above",
          severity: "warning",
          value: 10,
        },
      ],
      title: "Traffic",
      units: {},
    });
    expect(summary).toContain("Thresholds: warning at 10.0 upstream requests/s");
    expect(summary).toContain("Annotations: Note Fix landed at");
  });

  it("rejects query features the backend cannot preserve instead of weakening them", () => {
    const panel = Schema.decodeUnknownSync(MetricChartPanel)({
      _tag: "metric-chart",
      axes: [{ id: "left", unit: { _tag: "auto" } }],
      queries: [
        {
          aggregation: "avg",
          axis: "left",
          filters: [{ _tag: "range", attribute: "attempt", operator: "gte", value: 2 }],
          metric: "upstream.client.duration",
          refId: "A",
          window: "1h",
        },
      ],
      title: "Filtered latency",
      version: 1,
      visualization: "line",
    });
    const issue = buildPanelPlans(panel.queries).error;
    expect(issue).toMatchObject({
      _tag: "UnsupportedPanelQuery",
      diagnosis: "numeric range filters are not available yet",
      queryRef: "A",
    });
    expect(issue).toBeDefined();
    expect(panelQueryDiagnosis(issue!)).toBe(
      "Panel query A needs an update: numeric range filters are not available yet.",
    );
  });
});

describe("table rendering", () => {
  it("uses declared columns, value refs, sorting, and row limits", () => {
    const panel = Schema.decodeUnknownSync(TablePanel)({
      _tag: "table",
      columns: [
        { _tag: "time", id: "time", label: "Time", width: 120 },
        { _tag: "attribute", id: "region", attribute: "region", label: "Region" },
        {
          _tag: "value",
          id: "latency",
          queryRef: "A",
          label: "Latency",
          unit: { _tag: "duration", input: "ms", display: "ms" },
        },
      ],
      queries: [
        {
          aggregation: "p95",
          groupBy: { attributes: ["region"], maxSeries: 4 },
          metric: "http.server.duration",
          refId: "A",
          window: "1h",
        },
      ],
      rowLimit: 1,
      sort: { columnId: "latency", direction: "desc" },
      title: "Regional latency",
      version: 1,
    });
    const base = series({
      label: "region=west",
      queryRef: panel.queries[0].refId,
      values: [["2026-08-28T08:00:00Z", 120]],
    });
    const rows = buildPanelTableRows(panel, [
      { ...base, attributes: { region: "west" } },
      {
        ...base,
        attributes: { region: "east" },
        label: "region=east",
        points: [new MetricSeriesPoint({ at: at("2026-08-28T08:00:00Z"), value: 240 })],
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(tableCellValue(panel.columns[1]!, rows[0]!)).toBe("east");
    expect(tableCellValue(panel.columns[2]!, rows[0]!)).toBe(240);
  });
});
