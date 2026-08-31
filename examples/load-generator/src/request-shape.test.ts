import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { ScenarioStart } from "./contracts.js";
import { hasAmplificationWindow, phaseAt } from "./scenario-controller.js";
import { requestFor } from "./request-shape.js";

describe("requestFor", () => {
  it("creates the same workload for the same seed", () => {
    expect(requestFor(37, "video", 800)).toEqual(requestFor(37, "video", 800));
  });

  it("keeps users inside the configured deterministic pool", () => {
    const users = new Set(
      Array.from({ length: 32 }, (_, index) => requestFor(index, "video", 4).userId),
    );
    expect(users).toEqual(new Set(["user-0000", "user-0001", "user-0002", "user-0003"]));
  });
});

describe("phaseAt", () => {
  it("records deterministic phase boundaries", () => {
    expect(phaseAt(19_999, 20_000, 10_000)).toBe("baseline");
    expect(phaseAt(20_000, 20_000, 10_000)).toBe("blip");
    expect(phaseAt(29_999, 20_000, 10_000)).toBe("blip");
    expect(phaseAt(30_000, 20_000, 10_000)).toBe("amplification");
  });

  it("requires time for the amplification phase", () => {
    expect(hasAmplificationWindow(20_000, 10_000, 30_001)).toBe(true);
    expect(hasAmplificationWindow(20_000, 10_000, 30_000)).toBe(false);
  });
});

describe("ScenarioStart", () => {
  const decode = Schema.decodeUnknownSync(ScenarioStart);

  it("accepts the controlled retry-storm profile", () => {
    expect(
      decode({
        baselineDurationMs: 20_000,
        blipDurationMs: 10_000,
        incidentFailureRate: 0.65,
        maxDurationMs: 900_000,
        rateRps: 50,
        uniqueUsers: 800,
      }),
    ).toBeDefined();
  });

  it("rejects unsafe request rates and durations", () => {
    expect(() => decode({ rateRps: 501 })).toThrow();
    expect(() => decode({ maxDurationMs: 3_600_001 })).toThrow();
  });
});
