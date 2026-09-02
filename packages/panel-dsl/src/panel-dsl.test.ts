import { describe, expect, it } from "@effect/vitest";
import { Effect, Result, Schema } from "effect";
import { createHash } from "node:crypto";
import {
  GoldenPanels,
  PanelSpec,
  PanelSpecJsonSchema,
  PanelSpecJsonSchemaDocument,
  RequestsVsUsersPanel,
  RetryAmplificationPanel,
  UpstreamPressurePanel,
} from "./index.ts";

const decodePanel = Schema.decodeUnknownEffect(PanelSpec);
const decodePanelResult = Schema.decodeUnknownResult(PanelSpec);

describe("PanelSpec", () => {
  it("decodes all five golden investigation panels", async () => {
    const decoded = await Effect.runPromise(
      Effect.forEach(GoldenPanels, (panel) => decodePanel(panel)),
    );

    expect(decoded).toHaveLength(5);
    expect(decoded.every((panel) => panel._tag === "metric-chart")).toBe(true);
    expect(decoded).toEqual(GoldenPanels);
  });

  it("keeps retry amplification on upstream attempts, not incoming requests", () => {
    expect(RequestsVsUsersPanel.queries.map(({ metric }) => metric)).toEqual([
      "upstream.client.requests",
      "http.server.requests",
    ]);
    expect(RetryAmplificationPanel.queries[0]).toMatchObject({
      metric: "upstream.client.requests",
      groupBy: { attributes: ["attempt"] },
    });
    expect(UpstreamPressurePanel.queries[0]).toMatchObject({
      metric: "upstream.client.requests",
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

  it("decodes stat and table panel variants", async () => {
    const stat = await Effect.runPromise(
      decodePanel({
        _tag: "stat",
        version: 1,
        title: "Checkout p95 latency",
        query: {
          refId: "LATENCY",
          metric: "http.server.duration",
          aggregation: "p95",
          window: "1h",
          step: "30s",
          filters: [
            { _tag: "match", attribute: "service.name", operator: "eq", value: "checkout-api" },
          ],
        },
        reduction: "last",
        unit: { _tag: "duration", input: "ms", display: "auto", decimals: 0 },
        thresholds: [
          {
            value: 500,
            condition: "at_or_above",
            severity: "critical",
            label: "Latency SLO",
          },
        ],
        sparkline: true,
      }),
    );

    const table = await Effect.runPromise(
      decodePanel({
        _tag: "table",
        version: 1,
        title: "Slow routes",
        queries: [
          {
            refId: "P95",
            metric: "http.server.duration",
            aggregation: "p95",
            window: "1h",
            groupBy: { attributes: ["http.route"], maxSeries: 8 },
          },
        ],
        columns: [
          { _tag: "attribute", id: "route", attribute: "http.route", label: "Route" },
          {
            _tag: "value",
            id: "latency",
            queryRef: "P95",
            label: "P95 latency",
            unit: { _tag: "duration", input: "ms", display: "auto" },
          },
        ],
        sort: { columnId: "latency", direction: "desc" },
        rowLimit: 20,
      }),
    );

    expect(stat._tag).toBe("stat");
    expect(table._tag).toBe("table");
    if (table._tag === "table") {
      expect(table.columns).toHaveLength(2);
    }
  });

  it("rejects invalid distinct-count and grouped stat queries", () => {
    const missingDistinctAttribute = decodePanelResult({
      _tag: "stat",
      version: 1,
      title: "Unique users",
      query: {
        refId: "USERS",
        metric: "http.server.requests",
        aggregation: "count-distinct",
        window: "1h",
      },
      reduction: "last",
      unit: { _tag: "number", format: "short" },
    });
    const groupedStat = decodePanelResult({
      _tag: "stat",
      version: 1,
      title: "Requests",
      query: {
        refId: "REQUESTS",
        metric: "http.server.requests",
        aggregation: "rate",
        window: "1h",
        groupBy: { attributes: ["retry"], maxSeries: 2 },
      },
      reduction: "last",
      unit: { _tag: "rate", per: "second", noun: "requests" },
    });

    expect(Result.isFailure(missingDistinctAttribute)).toBe(true);
    expect(Result.isFailure(groupedStat)).toBe(true);
  });

  it("rejects duplicate and dangling chart references", () => {
    const result = decodePanelResult({
      _tag: "metric-chart",
      version: 1,
      title: "Broken chart",
      visualization: "line",
      queries: [
        {
          refId: "A",
          metric: "http.server.requests",
          aggregation: "rate",
          window: "1h",
          axis: "left",
        },
        {
          refId: "A",
          metric: "service.replicas",
          aggregation: "avg",
          window: "1h",
          axis: "right",
        },
      ],
      axes: [{ id: "left", unit: { _tag: "number", format: "short" } }],
      thresholds: [
        {
          value: 10,
          condition: "above",
          severity: "warning",
          axis: "right",
        },
      ],
    });

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(String(result.failure)).toContain("refId must be unique");
      expect(String(result.failure)).toContain("query axis right is not declared");
      expect(String(result.failure)).toContain("threshold axis right is not declared");
    }
  });

  it("rejects dangling table columns and sort keys", () => {
    const result = decodePanelResult({
      _tag: "table",
      version: 1,
      title: "Broken table",
      queries: [
        {
          refId: "A",
          metric: "http.server.requests",
          aggregation: "rate",
          window: "1h",
        },
      ],
      columns: [
        {
          _tag: "value",
          id: "value",
          queryRef: "B",
          label: "Value",
          unit: { _tag: "number", format: "short" },
        },
      ],
      sort: { columnId: "missing", direction: "desc" },
      rowLimit: 20,
    });

    expect(Result.isFailure(result)).toBe(true);
  });
});

describe("PanelSpec JSON Schema", () => {
  it("projects a serializable closed-object schema for WebMCP", () => {
    const serialized = JSON.stringify(PanelSpecJsonSchema);
    const definitions = PanelSpecJsonSchemaDocument.definitions;

    expect(JSON.parse(serialized)).toEqual(PanelSpecJsonSchema);
    expect(PanelSpecJsonSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(PanelSpecJsonSchemaDocument.schema).toEqual({ $ref: "#/$defs/PanelSpec" });
    expect(definitions.PanelSpec).toMatchObject({
      anyOf: [
        { $ref: "#/$defs/MetricChartPanel" },
        { $ref: "#/$defs/StatPanel" },
        { $ref: "#/$defs/TablePanel" },
      ],
    });
    expect(definitions.MetricChartPanel).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
  });

  it("keeps the complete generated contract snapshotted by digest", () => {
    const digest = createHash("sha256").update(JSON.stringify(PanelSpecJsonSchema)).digest("hex");

    expect(digest).toMatchInlineSnapshot(
      `"3e0b64cb55b9f521a158ac1e44a5d24bce608351b02db3d1d576230c5df25971"`,
    );
  });
});
