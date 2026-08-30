import { describe, expect, it } from "vite-plus/test";

import { investigationStage } from "./investigation-progress";

describe("sandbox investigation progress", () => {
  it("starts from a healthy baseline", () => {
    expect(investigationStage({ hasOpenIncident: false, hypotheses: [], panelCount: 1 })).toBe(
      "baseline",
    );
  });

  it("moves from orientation through challenge and evidence", () => {
    expect(investigationStage({ hasOpenIncident: true, hypotheses: [], panelCount: 1 })).toBe(
      "orient",
    );
    expect(
      investigationStage({
        hasOpenIncident: true,
        hypotheses: [{ status: "testing" }],
        panelCount: 1,
      }),
    ).toBe("challenge");
    expect(
      investigationStage({
        hasOpenIncident: true,
        hypotheses: [{ status: "rejected" }],
        panelCount: 2,
      }),
    ).toBe("evidence");
  });

  it("treats a confirmed hypothesis as the completion condition", () => {
    expect(
      investigationStage({
        hasOpenIncident: true,
        hypotheses: [{ status: "confirmed" }],
        panelCount: 3,
      }),
    ).toBe("diagnosed");
  });
});
