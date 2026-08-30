import { describe, expect, it } from "vite-plus/test";

import { investigationStage } from "./investigation-progress";

describe("sandbox investigation progress", () => {
  it("starts from a healthy baseline", () => {
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: false,
        hypotheses: [],
        panelCount: 1,
      }),
    ).toBe("baseline");
  });

  it("moves from orientation through challenge and evidence", () => {
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [],
        panelCount: 1,
      }),
    ).toBe("orient");
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [{ status: "testing", text: "A sudden traffic surge" }],
        panelCount: 1,
      }),
    ).toBe("challenge");
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [{ status: "rejected", text: "A sudden traffic surge" }],
        panelCount: 2,
      }),
    ).toBe("evidence");
  });

  it("requires the scenario cause to be confirmed before declaring diagnosis", () => {
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [{ status: "confirmed", text: "Retries amplify the upstream failure" }],
        panelCount: 3,
      }),
    ).toBe("diagnosed");
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [{ status: "confirmed", text: "A sudden traffic surge" }],
        panelCount: 3,
      }),
    ).toBe("evidence");
  });

  it("keeps a completed investigation distinct from a fresh baseline", () => {
    expect(
      investigationStage({
        hasClosedIncident: true,
        hasOpenIncident: false,
        hypotheses: [],
        panelCount: 1,
      }),
    ).toBe("reviewed");
  });
});
