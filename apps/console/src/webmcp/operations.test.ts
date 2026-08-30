import { AlertId, DashboardId, PanelId, ProjectId } from "@groundtruth/domain";
import { RequestsVsUsersPanel } from "@groundtruth/panel-dsl";
import { LogSearch, TraceSearch } from "@groundtruth/telemetry";
import { Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { makeBrowserApiClient } from "../api/client";
import type { ToolSessionSource } from "../api/session-source";
import { makeAlwaysTools } from "./always-tools";
import { makeLogSearch, makeTraceSearch } from "./operations";
import { makeToolOperations } from "./operations";

const projectId = Schema.decodeUnknownSync(ProjectId)("01890f6e-7c00-7000-8000-000000000001");
const dashboardId = Schema.decodeUnknownSync(DashboardId)("01890f6e-7c00-7000-8000-000000000002");
const panelId = Schema.decodeUnknownSync(PanelId)("01890f6e-7c00-7000-8000-000000000003");
const alertId = Schema.decodeUnknownSync(AlertId)("01890f6e-7c00-7000-8000-000000000004");
const occurredAt = "2026-08-30T06:00:00.000Z";

const sessions = (): ToolSessionSource => {
  const snapshot = { projectId, mode: "sandbox" as const, incident: null };
  return {
    getSnapshot: () => snapshot,
    refresh: async () => snapshot,
    subscribe: () => () => undefined,
  };
};

afterEach(() => vi.unstubAllGlobals());

describe("WebMCP telemetry search payloads", () => {
  it("constructs Effect log search payloads with bounded defaults", () => {
    const payload = makeLogSearch({ window: "15m" });

    expect(payload).toBeInstanceOf(LogSearch);
    expect(payload.limit).toBe(30);
    expect(payload.range).toEqual({ _tag: "relative", window: "15m" });
  });

  it("constructs Effect trace search payloads with bounded defaults", () => {
    const payload = makeTraceSearch({ status: "error", window: "1h" });

    expect(payload).toBeInstanceOf(TraceSearch);
    expect(payload.limit).toBe(30);
    expect(payload.range).toEqual({ _tag: "relative", window: "1h" });
  });
});

describe("WebMCP write payloads", () => {
  it("sends raw write tool inputs through their class-backed API contracts", async () => {
    const requests: Array<Request> = [];
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (new URL(request.url).pathname.endsWith("/alerts")) {
        return new Response(
          JSON.stringify({
            id: alertId,
            projectId,
            name: "Checkout latency",
            serviceName: "checkout-api",
            metricName: "http.server.duration",
            aggregation: "p95",
            comparison: "above",
            threshold: 250,
            windowSeconds: 300,
            severity: "warning",
            status: "healthy",
            summary: null,
            enabled: true,
            firingSince: null,
            resolvedAt: null,
            createdAt: occurredAt,
            updatedAt: occurredAt,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          metadata: {
            id: panelId,
            projectId,
            dashboardId,
            title: RequestsVsUsersPanel.title,
            position: 1,
            revision: 1,
            createdAt: occurredAt,
            updatedAt: occurredAt,
          },
          spec: RequestsVsUsersPanel,
          annotations: [],
        }),
        {
          status:
            request.method === "POST" && new URL(request.url).pathname.endsWith("/panels")
              ? 201
              : 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetch);

    const api = await makeBrowserApiClient({
      baseUrl: "https://api.clear.test",
      sessionStorage: null,
    });
    const operations = makeToolOperations(api, sessions());
    const tools = makeAlwaysTools(operations);
    const execute = (name: string, input: Record<string, unknown>) => {
      const prepared = tools.find((candidate) => candidate.name === name);
      if (prepared === undefined) throw new Error(`${name} tool is not registered`);
      return prepared.definition().execute(input, { signal: new AbortController().signal });
    };
    const rawSpec = JSON.parse(JSON.stringify(RequestsVsUsersPanel));

    const results = await Promise.all([
      execute("create_alert_rule", {
        name: "Checkout latency",
        serviceName: "checkout-api",
        metricName: "http.server.duration",
        aggregation: "p95",
        comparison: "above",
        threshold: 250,
        windowSeconds: 300,
        severity: "warning",
      }),
      execute("create_panel", { dashboardId, position: 1, spec: rawSpec }),
      execute("update_panel", {
        panelId,
        position: 1,
        expectedRevision: 1,
        spec: rawSpec,
      }),
      execute("annotate_panel", { panelId, at: occurredAt, label: "Evidence reviewed" }),
    ]);

    for (const result of results) expect(result).toMatchObject({ ok: true });
    expect(results[1]).toMatchObject({
      ok: true,
      data: expect.objectContaining({ id: panelId, dashboardId, position: 1 }),
    });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual(
      expect.arrayContaining([
        ["POST", `/v1/projects/${projectId}/alerts`],
        ["POST", `/v1/projects/${projectId}/panels`],
        ["PATCH", `/v1/projects/${projectId}/panels/${panelId}`],
        ["POST", `/v1/projects/${projectId}/panels/${panelId}/annotations`],
      ]),
    );
    const panelRequest = requests.find(
      (request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/panels"),
    );
    await expect(panelRequest?.clone().json()).resolves.toMatchObject({
      dashboardId,
      position: 1,
      spec: { _tag: "metric-chart", title: RequestsVsUsersPanel.title },
    });
  });
});
