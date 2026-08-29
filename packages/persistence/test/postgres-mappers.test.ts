import { AlertId, AlertName, ProjectId } from "@groundtruth/domain";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { PersistenceError } from "../src/errors.ts";
import { alertFromRow, decodeStored } from "../src/postgres/mappers.ts";
import { alerts, ProjectQuotas } from "../src/schema/index.ts";

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
});
