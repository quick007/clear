import { describe, expect, it } from "@effect/vitest";
import { maximumUserMetricCardinality, metricUserId } from "./telemetry-cardinality.js";

describe("metricUserId", () => {
  it("is deterministic and never returns the raw identifier", () => {
    expect(metricUserId("customer@example.com")).toBe(metricUserId("customer@example.com"));
    expect(metricUserId("customer@example.com")).not.toContain("customer@example.com");
  });

  it("places arbitrary input into a fixed number of metric buckets", () => {
    const buckets = new Set(
      Array.from({ length: maximumUserMetricCardinality * 2 }, (_, index) =>
        metricUserId(`hostile-${index}`),
      ),
    );

    expect(buckets.size).toBeLessThanOrEqual(maximumUserMetricCardinality);
  });

  it("retains the unique-user signal used by the incident", () => {
    const generatedUsers = new Set(
      Array.from({ length: 800 }, (_, index) =>
        metricUserId(`user-${index.toString().padStart(4, "0")}`),
      ),
    );

    expect(generatedUsers.size).toBeGreaterThanOrEqual(720);
  });
});
