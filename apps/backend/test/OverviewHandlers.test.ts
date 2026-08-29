import { assert, describe, it } from "@effect/vitest";
import { suggestedNextSteps } from "../src/http/OverviewHandlers.js";

describe("overview suggestions", () => {
  it("keeps active-incident guidance useful and hypothesis-neutral", () => {
    assert.deepStrictEqual(suggestedNextSteps(true, 1, false), [
      "Review the firing alerts and affected services",
      "Compare current signals with the healthy baseline",
      "Inspect correlated traces and error logs",
    ]);
  });

  it("guides empty and delayed projects without incident-specific assumptions", () => {
    assert.deepStrictEqual(suggestedNextSteps(false, 0, false), [
      "Connect an OpenTelemetry exporter",
      "Send metrics, logs, and traces to populate this project",
    ]);
    assert.deepStrictEqual(suggestedNextSteps(false, 1, true), [
      "Review delayed telemetry signals",
      "Inspect recent alerts",
    ]);
  });
});
