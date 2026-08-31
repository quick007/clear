import { describe, expect, it } from "@effect/vitest";
import { effectiveRate, hashUnit } from "./failure-model.js";

describe("failure model", () => {
  it("is deterministic for a recorded scenario seed", () => {
    expect(hashUnit("groundtruth:request-42:0")).toBe(hashUnit("groundtruth:request-42:0"));
    expect(hashUnit("groundtruth:request-42:0")).not.toBe(hashUnit("groundtruth:request-43:0"));
  });

  it("amplifies failures only after the expected request rate is exceeded", () => {
    expect(effectiveRate(0.002, 50, 51, 0.22)).toBe(0.002);
    expect(effectiveRate(0.65, 51, 51, 0.22)).toBe(0.65);
    expect(effectiveRate(0.65, 52, 51, 0.22)).toBeCloseTo(0.87);
    expect(effectiveRate(0.65, 53, 51, 0.22)).toBe(0.98);
  });
});
