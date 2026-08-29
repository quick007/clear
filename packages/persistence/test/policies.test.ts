import { describe, expect, it } from "vite-plus/test";
import { hostedProjectQuotas, hostedRawRetentionDays } from "../src/policies.ts";

describe("hosted project policy", () => {
  it("fits the public service into the single-node capacity budget", () => {
    expect(hostedRawRetentionDays).toBe(1);
    expect(hostedProjectQuotas).toEqual({
      maxIngestBytesPerMinute: 5_000_000,
      maxActiveSeries: 5_000,
      maxPanels: 12,
    });
  });
});
