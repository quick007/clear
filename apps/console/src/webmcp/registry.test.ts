import { Incident, ProjectId } from "@groundtruth/domain";
import {
  MetricQuery,
  MetricQueryResult,
  MetricQueryStats,
  MetricName,
  MetricSeries,
  MetricSeriesPoint,
} from "@groundtruth/telemetry";
import { DateTime, Schema } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ToolSessionSnapshot, ToolSessionSource } from "../api/session-source";
import { makeAlwaysTools } from "./always-tools";
import { makeIncidentTools } from "./incident-tools";
import type { GroundtruthToolOperations } from "./operations";
import { GroundtruthToolRegistry, type ModelContextTarget } from "./registry";
import { toolResultLimits } from "./result-bounds";
import { QueryMetricsInput, schemaJson } from "./schemas";
import { tool } from "./tool-contract";

const projectId = Schema.decodeUnknownSync(ProjectId)("01890f6e-7c00-7000-8000-000000000001");
const openIncident = Schema.decodeUnknownSync(Incident)({
  id: "01890f6e-7c00-7000-8000-000000000002",
  projectId,
  title: "Checkout errors",
  status: "open",
  summary: null,
  openedAt: "2026-08-28T06:00:00.000Z",
  closedAt: null,
  createdAt: "2026-08-28T06:00:00.000Z",
  updatedAt: "2026-08-28T06:00:00.000Z",
});

const fakeOperations = (
  overrides: Partial<GroundtruthToolOperations> = {},
): GroundtruthToolOperations =>
  new Proxy(overrides, {
    get: (target, property, receiver) =>
      Reflect.has(target, property)
        ? Reflect.get(target, property, receiver)
        : async () => {
            throw new Error(`Unexpected operation: ${String(property)}`);
          },
  }) as GroundtruthToolOperations;

const flushTasks = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

const fakeSessions = (initial: ToolSessionSnapshot) => {
  let snapshot = initial;
  const listeners = new Set<(next: ToolSessionSnapshot) => void>();
  const source: ToolSessionSource = {
    getSnapshot: () => snapshot,
    refresh: async () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    set: async (next: ToolSessionSnapshot) => {
      snapshot = next;
      listeners.forEach((listener) => listener(snapshot));
      await flushTasks();
    },
  };
};

const fakeModelContext = (
  config: {
    readonly failOnce?: string;
    readonly failCount?: number;
    readonly waitFor?: (name: string, signal: AbortSignal | undefined) => Promise<void>;
  } = {},
) => {
  const tools = new Map<string, WebMCP.ModelContextTool>();
  let failuresRemaining = config.failOnce === undefined ? 0 : (config.failCount ?? 1);
  const target: ModelContextTarget = {
    registerTool: async (tool, registrationOptions) => {
      if (tool.name === config.failOnce && failuresRemaining > 0) {
        failuresRemaining -= 1;
        throw new Error(`failed ${tool.name}`);
      }
      await config.waitFor?.(tool.name, registrationOptions?.signal);
      if (registrationOptions?.signal?.aborted) throw registrationOptions.signal.reason;
      if (tools.has(tool.name)) throw new Error(`duplicate ${tool.name}`);
      tools.set(tool.name, tool);
      registrationOptions?.signal?.addEventListener("abort", () => tools.delete(tool.name), {
        once: true,
      });
    },
  };
  return { target, tools };
};

describe("GroundtruthToolRegistry", () => {
  it("registers and atomically removes sandbox and incident scopes", async () => {
    const sessions = fakeSessions({ projectId, mode: "sandbox", incident: openIncident });
    const modelContext = fakeModelContext();
    const registry = new GroundtruthToolRegistry({
      modelContext: modelContext.target,
      sessions: sessions.source,
      operations: fakeOperations(),
    });

    await registry.start();
    expect(modelContext.tools.has("get_console_overview")).toBe(true);
    expect(modelContext.tools.has("open_incident")).toBe(true);
    expect(modelContext.tools.has("start_sandbox_incident")).toBe(true);
    expect(modelContext.tools.has("add_timeline_note")).toBe(true);

    await sessions.set({ projectId, mode: "hosted", incident: null });
    expect(modelContext.tools.has("get_console_overview")).toBe(true);
    expect(modelContext.tools.has("start_sandbox_incident")).toBe(false);
    expect(modelContext.tools.has("add_timeline_note")).toBe(false);

    registry.stop();
    expect(modelContext.tools.size).toBe(0);
  });

  it("publishes closed Effect JSON schemas and validates invocation input", async () => {
    const operations = fakeOperations({ listAlerts: async () => [] });
    const listAlerts = makeAlwaysTools(operations).find((entry) => entry.name === "list_alerts");
    expect(listAlerts).toBeDefined();
    const definition = listAlerts?.definition();
    expect(definition?.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
    expect(definition?.inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });

    const signal = new AbortController().signal;
    const invalid = await definition?.execute({ status: "broken" }, { signal });
    expect(invalid).toMatchObject({ ok: false });

    const valid = await definition?.execute({ status: "firing" }, { signal });
    expect(valid).toEqual({
      ok: true,
      data: [],
      hint: "Use the alert metric and service to choose the first query.",
    });
  });

  it("publishes no-input tools as closed objects and rejects browser-shaped alternatives", async () => {
    const overview = makeAlwaysTools(fakeOperations({ listServices: async () => [] })).find(
      (entry) => entry.name === "list_services",
    );
    const definition = overview?.definition();
    if (definition === undefined) throw new Error("list_services was not prepared");

    expect(definition.inputSchema).toEqual({
      type: "object",
      additionalProperties: false,
    });

    const signal = new AbortController().signal;
    const executeUnknown = (input: unknown) => definition.execute(input as never, { signal });
    await expect(executeUnknown({})).resolves.toMatchObject({ ok: true });
    await expect(executeUnknown([])).resolves.toMatchObject({ ok: false });
    await expect(executeUnknown({ unexpected: true })).resolves.toMatchObject({
      ok: false,
    });
  });

  it("publishes optional fields that agree with runtime decoding", () => {
    const inputSchema = schemaJson(QueryMetricsInput);
    expect(inputSchema).toMatchObject({
      properties: {
        step: { type: "string", enum: ["10s", "30s", "1m", "5m"] },
      },
    });
    expect(() =>
      Schema.decodeUnknownSync(QueryMetricsInput)({
        metric: Schema.decodeUnknownSync(MetricName)("http.server.requests"),
        aggregation: "sum",
        window: "5m",
        step: null,
      }),
    ).toThrow();
    expect(
      Schema.decodeUnknownSync(QueryMetricsInput)({
        metric: "http.server.requests",
        aggregation: "sum",
        window: "5m",
      }),
    ).not.toHaveProperty("step");
  });

  it("rolls back partial registration and retries startup automatically", async () => {
    vi.useFakeTimers();
    const sessions = fakeSessions({ projectId, mode: "hosted", incident: null });
    const modelContext = fakeModelContext({ failOnce: "get_console_overview" });
    const registry = new GroundtruthToolRegistry({
      modelContext: modelContext.target,
      sessions: sessions.source,
      operations: fakeOperations(),
    });
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const started = registry.start();
    await vi.runAllTimersAsync();
    await started;
    expect(modelContext.tools.has("get_console_overview")).toBe(true);
    expect(report).toHaveBeenCalledWith(
      "[Clear] session site tool registration failed",
      expect.objectContaining({ cause: expect.any(Error) }),
    );
    registry.stop();
    report.mockRestore();
    vi.useRealTimers();
  });

  it("retries a failed dynamic scope during initial reconciliation", async () => {
    vi.useFakeTimers();
    const sessions = fakeSessions({ projectId, mode: "sandbox", incident: null });
    const modelContext = fakeModelContext({ failOnce: "start_sandbox_incident" });
    const registry = new GroundtruthToolRegistry({
      modelContext: modelContext.target,
      sessions: sessions.source,
      operations: fakeOperations(),
    });
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const started = registry.start();
    await vi.runAllTimersAsync();
    await started;
    expect(modelContext.tools.has("start_sandbox_incident")).toBe(true);
    expect(report).toHaveBeenCalledWith(
      "[Clear] sandbox site tool registration failed",
      expect.objectContaining({ cause: expect.any(Error) }),
    );
    registry.stop();
    report.mockRestore();
    vi.useRealTimers();
  });

  it("recovers from a failed dynamic scope update", async () => {
    vi.useFakeTimers();
    const sessions = fakeSessions({ projectId, mode: "hosted", incident: null });
    const modelContext = fakeModelContext({ failOnce: "add_timeline_note" });
    const registry = new GroundtruthToolRegistry({
      modelContext: modelContext.target,
      sessions: sessions.source,
      operations: fakeOperations(),
    });
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await registry.start();
    await sessions.set({ projectId, mode: "hosted", incident: openIncident });
    expect(modelContext.tools.has("add_timeline_note")).toBe(false);
    expect(report).toHaveBeenCalledWith(
      "[Clear] incident site tool registration failed",
      expect.objectContaining({ cause: expect.any(Error) }),
    );

    await vi.runAllTimersAsync();
    await flushTasks();
    expect(modelContext.tools.has("add_timeline_note")).toBe(true);
    report.mockRestore();
    registry.stop();
    vi.useRealTimers();
  });

  it("stops retrying and rejects after persistent registration failures", async () => {
    vi.useFakeTimers();
    const sessions = fakeSessions({ projectId, mode: "hosted", incident: null });
    const modelContext = fakeModelContext({
      failOnce: "get_console_overview",
      failCount: 10,
    });
    const registry = new GroundtruthToolRegistry({
      modelContext: modelContext.target,
      sessions: sessions.source,
      operations: fakeOperations(),
    });
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const outcome = registry.start().then(
      () => ({ _tag: "Started" as const }),
      (error: unknown) => ({ _tag: "Failed" as const, error }),
    );
    await vi.runAllTimersAsync();
    await expect(outcome).resolves.toMatchObject({
      _tag: "Failed",
      error: { _tag: "WebMcpRegistrationFailure", scope: "session" },
    });
    expect(modelContext.tools.size).toBe(0);
    expect(report).toHaveBeenCalledTimes(5);
    report.mockRestore();
    vi.useRealTimers();
  });

  it("restarts cleanly and prevents pending reconciliation from reviving stopped tools", async () => {
    let releaseRegistration: () => void = () => undefined;
    const registrationGate = new Promise<void>((resolve) => {
      releaseRegistration = resolve;
    });
    const sessions = fakeSessions({ projectId, mode: "hosted", incident: null });
    const modelContext = fakeModelContext({
      waitFor: (name) => (name === "add_timeline_note" ? registrationGate : Promise.resolve()),
    });
    const registry = new GroundtruthToolRegistry({
      modelContext: modelContext.target,
      sessions: sessions.source,
      operations: fakeOperations(),
    });

    await registry.start();
    await sessions.set({ projectId, mode: "hosted", incident: openIncident });
    registry.stop();
    releaseRegistration();
    await flushTasks();
    expect(modelContext.tools.size).toBe(0);

    await registry.start();
    expect(modelContext.tools.has("get_console_overview")).toBe(true);
    registry.stop();
  });

  it("returns close_incident before refreshing and unregistering its scope", async () => {
    vi.useFakeTimers();
    let refreshes = 0;
    const snapshot = { projectId, mode: "hosted", incident: null } as const;
    const closedIncident = {
      incident: openIncident,
      hypotheses: [],
      timeline: [],
    } as Awaited<ReturnType<GroundtruthToolOperations["closeIncident"]>>;
    const operations = fakeOperations({
      closeIncident: async () => closedIncident,
      refreshSession: async () => {
        refreshes += 1;
        return snapshot;
      },
    });
    const closeIncident = makeIncidentTools(operations, "hosted").find(
      (entry) => entry.name === "close_incident",
    );

    const result = await closeIncident
      ?.definition()
      .execute(
        { summary: "Retry amplification is resolved." },
        { signal: new AbortController().signal },
      );
    expect(result).toMatchObject({ ok: true });
    expect(refreshes).toBe(0);

    await vi.runAllTimersAsync();
    expect(refreshes).toBe(1);
    vi.useRealTimers();
  });

  it("registers mode-aware close guidance", async () => {
    const sessions = fakeSessions({ projectId, mode: "sandbox", incident: openIncident });
    const modelContext = fakeModelContext();
    const registry = new GroundtruthToolRegistry({
      modelContext: modelContext.target,
      sessions: sessions.source,
      operations: fakeOperations(),
    });

    await registry.start();
    expect(modelContext.tools.get("close_incident")?.description).toContain(
      "sandbox has no remediation step",
    );
    expect(modelContext.tools.get("close_incident")?.description).toContain(
      "visible recovery is not required",
    );

    await sessions.set({ projectId, mode: "hosted", incident: openIncident });
    expect(modelContext.tools.get("close_incident")?.description).toContain(
      "If remediation occurred",
    );
    expect(modelContext.tools.get("close_incident")?.description).toContain(
      "confirm that recovery is visible",
    );

    registry.stop();
  });

  it("returns open_incident before refreshing and registering its incident scope", async () => {
    vi.useFakeTimers();
    const sessions = fakeSessions({ projectId, mode: "hosted", incident: null });
    const modelContext = fakeModelContext();
    let openedTitle = "";
    let refreshes = 0;
    const incidentDetail = {
      incident: openIncident,
      hypotheses: [],
      timeline: [],
    } as Awaited<ReturnType<GroundtruthToolOperations["openIncident"]>>;
    const operations = fakeOperations({
      openIncident: async (input) => {
        openedTitle = input.title;
        return incidentDetail;
      },
      refreshSession: async () => {
        refreshes += 1;
        const snapshot = { projectId, mode: "hosted", incident: openIncident } as const;
        await sessions.set(snapshot);
        return snapshot;
      },
    });
    const registry = new GroundtruthToolRegistry({
      modelContext: modelContext.target,
      sessions: sessions.source,
      operations,
    });

    await registry.start();
    const openIncidentTool = modelContext.tools.get("open_incident");
    expect(openIncidentTool?.annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: true,
    });
    expect(openIncidentTool?.inputSchema).toMatchObject({
      type: "object",
      required: ["title"],
      additionalProperties: false,
    });

    const invalid = await openIncidentTool?.execute(
      { title: "x".repeat(161) },
      { signal: new AbortController().signal },
    );
    expect(invalid).toMatchObject({ ok: false });
    expect(openedTitle).toBe("");

    const result = await openIncidentTool?.execute(
      { title: "Checkout retry amplification" },
      { signal: new AbortController().signal },
    );
    expect(result).toMatchObject({ ok: true, truncated: false });
    expect(openedTitle).toBe("Checkout retry amplification");
    expect(refreshes).toBe(0);
    expect(modelContext.tools.has("add_timeline_note")).toBe(false);

    await vi.runAllTimersAsync();
    await flushTasks();
    expect(refreshes).toBe(1);
    expect(modelContext.tools.has("add_timeline_note")).toBe(true);

    registry.stop();
    vi.useRealTimers();
  });

  it("bounds untrusted tool output without dropping its agent hint", async () => {
    const definition = tool({
      name: "inspect_untrusted_data",
      title: "Inspect untrusted data",
      description: "Returns telemetry supplied by an external system.",
      input: Schema.Struct({}),
      readOnly: true,
      returnsUntrustedContent: true,
      invoke: async () => ({ body: "x".repeat(200_000) }),
      successHint: "Narrow the time window to inspect the omitted records.",
      failureHint: "Retry with a smaller time window.",
    }).definition();

    const result = await definition.execute({}, { signal: new AbortController().signal });
    const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;

    expect(definition.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
    expect(bytes).toBeLessThanOrEqual(toolResultLimits.maxBytes);
    expect(result).toMatchObject({
      ok: true,
      truncated: true,
      hint: "Narrow the time window to inspect the omitted records.",
    });
  });

  it("marks metric output truncated when the formatter drops requested points", async () => {
    const metricResult = new MetricQueryResult({
      query: new MetricQuery({
        metric: Schema.decodeUnknownSync(MetricName)("http.server.requests"),
        aggregation: "sum",
        range: { _tag: "relative", window: "5m" },
        maxPoints: 240,
      }),
      stats: new MetricQueryStats({
        minimum: 0,
        maximum: 120,
        average: 60,
        sum: 7_260,
        count: 121,
        last: 120,
      }),
      pointCount: 121,
      partial: false,
      series: [
        new MetricSeries({
          label: "requests",
          attributes: {},
          points: Array.from(
            { length: 121 },
            (_, index) =>
              new MetricSeriesPoint({
                at: DateTime.makeUnsafe(index * 1_000),
                value: index,
              }),
          ),
        }),
      ],
      hint: null,
    });
    const operations = fakeOperations({ queryMetrics: async () => metricResult });
    const queryMetrics = makeAlwaysTools(operations).find(
      (entry) => entry.name === "query_metrics",
    );

    const result = await queryMetrics?.definition().execute(
      {
        metric: "http.server.requests",
        aggregation: "sum",
        window: "5m",
        maxPoints: 240,
      },
      { signal: new AbortController().signal },
    );
    expect(result).toMatchObject({ ok: true, truncated: true });
  });
});
