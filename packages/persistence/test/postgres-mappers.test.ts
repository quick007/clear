import {
  AlertId,
  AlertName,
  DashboardId,
  PanelId,
  PanelTitle,
  ProjectId,
} from "@groundtruth/domain";
import { RequestsVsUsersPanel } from "@groundtruth/panel-dsl";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { PersistenceError } from "../src/errors.ts";
import { alertFromRow, decodeStored, panelFromRow } from "../src/postgres/mappers.ts";
import { alerts, panels, ProjectQuotas } from "../src/schema/index.ts";

const alertRow = {
  id: Schema.decodeUnknownSync(AlertId)("0198f1a2-3b4c-7def-a345-6789abcdef01"),
  projectId: Schema.decodeUnknownSync(ProjectId)("0198f1a2-3b4c-7def-b456-789abcdef012"),
  name: AlertName.make("Checkout latency"),
  serviceName: null,
  metricName: "http.server.duration",
  aggregation: "p95",
  comparison: "above",
  threshold: 500,
  windowSeconds: 300,
  severity: "critical",
  status: "firing",
  summary: null,
  enabled: true,
  firingSince: new Date("2026-08-28T08:00:00.000Z"),
  resolvedAt: null,
  createdAt: new Date("2026-08-28T08:00:00.000Z"),
  updatedAt: new Date("2026-08-28T08:01:00.000Z"),
} satisfies typeof alerts.$inferSelect;

const panelRow = {
  id: Schema.decodeUnknownSync(PanelId)("0198f1a2-3b4c-7def-a345-6789abcdef02"),
  projectId: alertRow.projectId,
  dashboardId: Schema.decodeUnknownSync(DashboardId)("0198f1a2-3b4c-7def-a345-6789abcdef03"),
  title: PanelTitle.make("Upstream pressure"),
  spec: RequestsVsUsersPanel,
  annotations: [],
  position: 0,
  revision: 0,
  createdAt: new Date("2026-08-28T08:00:00.000Z"),
  updatedAt: new Date("2026-08-28T08:01:00.000Z"),
} satisfies typeof panels.$inferSelect;

describe("PostgreSQL stored row decoding", () => {
  it("turns a malformed stored alert into a typed persistence error", async () => {
    const malformedRow = { ...alertRow };
    Reflect.set(malformedRow, "aggregation", "not-an-aggregation");

    const error = await Effect.runPromise(
      Effect.flip(decodeStored("alert", () => alertFromRow(malformedRow))),
    );

    expect(error).toBeInstanceOf(PersistenceError);
    expect(error.store).toBe("postgres");
    expect(error.operation).toBe("decode-alert");
    expect(error.retryable).toBe(false);
    expect(error.correlationId).not.toBe("");
    expect(error.message).toBe(`Storage operation failed (reference ${error.correlationId})`);
    expect(error.message).not.toContain("not-an-aggregation");
  });

  it("rejects malformed quota JSON through the typed error channel", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        decodeStored("project-quotas", () =>
          Schema.decodeUnknownSync(ProjectQuotas)({
            maxIngestBytesPerMinute: -1,
            maxActiveSeries: 100_000,
            maxPanels: 100,
          }),
        ),
      ),
    );

    expect(error).toBeInstanceOf(PersistenceError);
    expect(error.operation).toBe("decode-project-quotas");
    expect(error.retryable).toBe(false);
  });

  it("rejects malformed panel JSON instead of trusting the database type annotation", async () => {
    const malformedRow = { ...panelRow };
    Reflect.set(malformedRow, "spec", { ...RequestsVsUsersPanel, version: 999 });

    const error = await Effect.runPromise(
      Effect.flip(decodeStored("panel", () => panelFromRow(malformedRow))),
    );

    expect(error).toBeInstanceOf(PersistenceError);
    expect(error.operation).toBe("decode-panel");
    expect(error.retryable).toBe(false);
  });
});
