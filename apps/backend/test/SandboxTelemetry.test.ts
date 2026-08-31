import { describe, expect, it } from "@effect/vitest";
import { histogramBucketCounts } from "../src/sandbox/SandboxTelemetry.js";

describe("sandbox histogram buckets", () => {
  it("keeps each percentile rank inside its matching bound", () => {
    for (let count = 1; count <= 1_000; count += 1) {
      const buckets = histogramBucketCounts(count).map(Number);
      const throughP50 = buckets[0] ?? 0;
      const throughP95 = throughP50 + (buckets[1] ?? 0);
      const throughP99 = throughP95 + (buckets[2] ?? 0);
      expect(throughP50).toBeGreaterThanOrEqual(count * 0.5);
      expect(throughP95).toBeGreaterThanOrEqual(count * 0.95);
      expect(throughP99).toBeGreaterThanOrEqual(count * 0.99);
      expect(buckets.reduce((total, bucket) => total + bucket, 0)).toBe(count);
    }
  });
});
