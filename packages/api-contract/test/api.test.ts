import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";
import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { GroundtruthApi } from "../src/api.ts";
import { LiveApi, LiveEventStream } from "../src/groups/live.ts";
import { TelemetryActivityHint } from "../src/model/collector.ts";

const endpointIds = new Map<string, Array<string>>();

HttpApi.reflect(GroundtruthApi, {
  onGroup: ({ group }) => endpointIds.set(group.identifier, []),
  onEndpoint: ({ endpoint, group }) => endpointIds.get(group.identifier)?.push(endpoint.identifier),
});

describe("GroundtruthApi", () => {
  it("contains every implementation group and endpoint", () => {
    expect(endpointIds).toEqual(
      new Map([
        ["health", ["check"]],
        ["publicStatus", ["getStatus"]],
        ["auth", ["createHandoff", "completeHandoff", "getSession", "logout"]],
        [
          "alerts",
          [
            "createAlert",
            "deleteAlert",
            "listManualAlerts",
            "createManualAlert",
            "startInvestigation",
          ],
        ],
        ["overview", ["getOverview", "listServices", "listAlerts"]],
        [
          "telemetry",
          ["listMetrics", "queryMetrics", "searchLogs", "sampleLogs", "searchTraces", "getTrace"],
        ],
        ["board", ["getBoard", "createPanel", "updatePanel", "removePanel", "annotatePanel"]],
        [
          "incidents",
          [
            "getIncident",
            "listIncidents",
            "openIncident",
            "setHypothesis",
            "addTimelineNote",
            "closeIncident",
          ],
        ],
        ["ingestKeys", ["listIngestKeys", "createIngestKey", "revokeIngestKey"]],
        ["deploys", ["listDeployEvents", "recordDeployEvent"]],
        ["sandbox", ["createSession", "triggerIncident", "simulateRecovery", "reset"]],
        ["live", ["stream"]],
        [
          "collector",
          ["authorizeIngest", "ingestMetrics", "ingestLogs", "ingestTraces", "publishActivity"],
        ],
      ]),
    );
  });

  it("models the live endpoint as typed SSE", () => {
    const successSchemas = Array.from(LiveApi.endpoints.stream.success);
    expect(successSchemas).toHaveLength(1);
    expect(successSchemas[0]).toBe(LiveEventStream);
    expect(LiveEventStream._tag).toBe("StreamSse");
  });

  it("publishes public routes and omits private collector routes", () => {
    const spec = OpenApi.fromApi(GroundtruthApi);
    expect(spec.info.title).toBe("Clear API");
    expect(spec.paths["/health"]?.get).toBeDefined();
    expect(spec.paths["/v1/public/status"]?.get).toBeDefined();
    expect(spec.paths["/v1/projects/{projectId}/traces/{traceId}"]?.get).toBeDefined();
    expect(spec.paths["/v1/projects/{projectId}/incidents/{incidentId}"]?.get).toBeDefined();
    expect(spec.paths["/v1/projects/{projectId}/events/stream"]?.get).toBeDefined();
    expect(spec.paths["/v1/projects/{projectId}/ingest-keys"]?.post).toBeDefined();
    expect(spec.paths["/v1/projects/{projectId}/alerts"]?.post).toBeDefined();
    expect(spec.paths["/v1/projects/{projectId}/alerts/manual"]?.post).toBeDefined();
    expect(spec.paths["/v1/projects/{projectId}/alerts/manual"]?.get).toBeDefined();
    expect(
      spec.paths["/v1/projects/{projectId}/alerts/{alertId}/investigation"]?.post,
    ).toBeDefined();
    expect(spec.paths["/v1/projects/{projectId}/alerts/{alertId}"]?.delete).toBeDefined();
    expect(spec.paths["/v1/projects/{projectId}/incidents"]?.get).toBeDefined();
    expect(spec.paths["/v1/sandbox/fix"]).toBeUndefined();
    expect(spec.paths["/internal/v1/ingest/authorize"]).toBeUndefined();
  });

  it("documents the bounded public status projection", () => {
    const spec = OpenApi.fromApi(GroundtruthApi);
    const status = spec.paths["/v1/public/status"]?.get;
    expect(status?.responses["200"]).toBeDefined();
    expect(status?.responses["503"]).toBeDefined();
    expect(status?.security).toEqual([]);
  });

  it("documents the browser handoff redirect status", () => {
    const spec = OpenApi.fromApi(GroundtruthApi);
    const callback = spec.paths["/v1/auth/chatgpt/callback"]?.get;
    expect(callback?.responses["303"]).toBeDefined();
  });

  it("does not expose the obsolete self-hosted browser login", () => {
    const spec = OpenApi.fromApi(GroundtruthApi);
    expect(spec.paths["/v1/auth/self-hosted"]).toBeUndefined();
  });

  it("documents degraded readiness as unavailable", () => {
    const spec = OpenApi.fromApi(GroundtruthApi);
    const health = spec.paths["/health"]?.get;
    expect(health?.responses["200"]).toBeDefined();
    expect(health?.responses["503"]).toBeDefined();
  });

  it("documents infrastructure failures on authenticated telemetry routes", () => {
    const spec = OpenApi.fromApi(GroundtruthApi);
    const metrics = spec.paths["/v1/projects/{projectId}/metrics"]?.get;
    expect(metrics?.responses["401"]).toBeDefined();
    expect(metrics?.responses["503"]).toBeDefined();
  });

  it.effect("bounds nested activity service fanout", () =>
    Effect.gen(function* () {
      const activity = {
        signal: "metrics",
        itemCount: 1,
        observedAt: "2026-08-28T08:00:00.000Z",
        services: Array.from({ length: 64 }, (_, index) => `service-${index}`),
      };
      const hint = {
        droppedNotifications: 0,
        activities: [activity],
      };
      const accepted = yield* Schema.decodeUnknownEffect(TelemetryActivityHint)(hint);
      expect(accepted.activities[0]?.services).toHaveLength(64);

      const rejected = yield* Schema.decodeUnknownEffect(TelemetryActivityHint)({
        ...hint,
        activities: [
          {
            ...activity,
            services: [...activity.services, "service-64"],
          },
        ],
      }).pipe(Effect.exit);
      expect(Exit.isFailure(rejected)).toBe(true);
    }),
  );
});
