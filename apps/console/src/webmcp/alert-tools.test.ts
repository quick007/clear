import { Alert, ProjectId } from "@groundtruth/domain";
import { Schema } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import { makeAlwaysTools } from "./always-tools";
import type { GroundtruthToolOperations } from "./operations";

const projectId = Schema.decodeUnknownSync(ProjectId)("01890f6e-7c00-7000-8000-000000000001");
const alertRule = Schema.decodeUnknownSync(Alert)({
  id: "01890f6e-7c00-7000-8000-000000000003",
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
  createdAt: "2026-08-28T06:00:00.000Z",
  updatedAt: "2026-08-28T06:00:00.000Z",
});

const fakeOperations = (overrides: Partial<GroundtruthToolOperations>): GroundtruthToolOperations =>
  new Proxy(overrides, {
    get: (target, property, receiver) =>
      Reflect.has(target, property)
        ? Reflect.get(target, property, receiver)
        : async () => {
            throw new Error(`Unexpected operation: ${String(property)}`);
          },
  }) as GroundtruthToolOperations;

describe("alert WebMCP tools", () => {
  it("creates and removes alert rules with closed bounded schemas", async () => {
    const createAlertRule = vi.fn(async () => alertRule);
    const removeAlertRule = vi.fn(async () => undefined);
    const tools = makeAlwaysTools(fakeOperations({ createAlertRule, removeAlertRule }));
    const create = tools.find((entry) => entry.name === "create_alert_rule")?.definition();
    const remove = tools.find((entry) => entry.name === "remove_alert_rule")?.definition();
    if (create === undefined || remove === undefined) {
      throw new Error("Alert tools were not prepared");
    }

    expect(create.annotations).toEqual({ readOnlyHint: false, untrustedContentHint: true });
    expect(create.inputSchema).toMatchObject({
      type: "object",
      required: [
        "name",
        "serviceName",
        "metricName",
        "aggregation",
        "comparison",
        "threshold",
        "windowSeconds",
        "severity",
      ],
      additionalProperties: false,
    });
    const signal = new AbortController().signal;
    await expect(
      create.execute(
        {
          name: "Checkout users",
          serviceName: "checkout-api",
          metricName: "http.server.requests",
          aggregation: "count-distinct",
          comparison: "above",
          threshold: 1_000,
          windowSeconds: 300,
          severity: "warning",
        },
        { signal },
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(createAlertRule).not.toHaveBeenCalled();

    await expect(
      create.execute(
        {
          name: "Checkout latency",
          serviceName: "checkout-api",
          metricName: "http.server.duration",
          aggregation: "p95",
          comparison: "above",
          threshold: 250,
          windowSeconds: 300,
          severity: "warning",
        },
        { signal },
      ),
    ).resolves.toMatchObject({
      ok: true,
      data: { id: alertRule.id, metric: "http.server.duration", status: "healthy" },
    });
    expect(createAlertRule).toHaveBeenCalledWith(
      expect.objectContaining({ aggregation: "p95" }),
      signal,
    );

    await expect(remove.execute({ alertId: alertRule.id }, { signal })).resolves.toEqual({
      ok: true,
      data: { removed: true },
      hint: "Call list_alerts to verify the remaining rules.",
    });
    expect(removeAlertRule).toHaveBeenCalledWith({ alertId: alertRule.id }, signal);
  });
});
