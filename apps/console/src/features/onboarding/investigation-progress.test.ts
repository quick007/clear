import {
  RequestsVsUsersPanel,
  RetryAmplificationPanel,
  UpstreamPressurePanel,
  PanelTitle,
} from "@groundtruth/panel-dsl";
import { describe, expect, it } from "vite-plus/test";

import {
  investigationJourneyPosition,
  investigationStage,
  isAttemptsGroupedRetryPanel,
  isRequestsVersusUsersPanel,
} from "./investigation-progress";

const requestsVersusUsers = { spec: RequestsVsUsersPanel };
const attemptsGroupedRetries = { spec: RetryAmplificationPanel };
const unrelatedPanel = { spec: UpstreamPressurePanel };

describe("sandbox investigation progress", () => {
  it("advances the visible journey as evidence changes", () => {
    expect(investigationJourneyPosition("baseline")).toBe(0);
    expect(investigationJourneyPosition("orient")).toBe(0);
    expect(investigationJourneyPosition("challenge")).toBe(1);
    expect(investigationJourneyPosition("evidence")).toBe(2);
    expect(investigationJourneyPosition("diagnosed")).toBe(3);
    expect(investigationJourneyPosition("recovering")).toBe(4);
    expect(investigationJourneyPosition("recovered")).toBe(4);
    expect(investigationJourneyPosition("reviewed")).toBe(4);
  });

  it("starts from a healthy baseline and keeps closed investigations distinct", () => {
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: false,
        hypotheses: [],
        panels: [unrelatedPanel],
      }),
    ).toBe("baseline");
    expect(
      investigationStage({
        hasClosedIncident: true,
        hasOpenIncident: false,
        hypotheses: [],
        panels: [unrelatedPanel],
      }),
    ).toBe("reviewed");
  });

  it("recognizes evidence from query structure rather than panel titles or counts", () => {
    expect(
      isRequestsVersusUsersPanel({
        spec: { ...RequestsVsUsersPanel, title: PanelTitle.make("Untitled evidence") },
      }),
    ).toBe(true);
    expect(
      isAttemptsGroupedRetryPanel({
        spec: { ...RetryAmplificationPanel, title: PanelTitle.make("Payment calls") },
      }),
    ).toBe(true);
    expect(isRequestsVersusUsersPanel(unrelatedPanel)).toBe(false);
    expect(isAttemptsGroupedRetryPanel(unrelatedPanel)).toBe(false);
  });

  it("moves through the scenario only when the relevant evidence is present", () => {
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [],
        panels: [unrelatedPanel],
      }),
    ).toBe("orient");
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [{ status: "testing", text: "A sudden traffic surge" }],
        panels: [unrelatedPanel],
      }),
    ).toBe("challenge");
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [{ status: "rejected", text: "A sudden traffic surge" }],
        panels: [requestsVersusUsers],
      }),
    ).toBe("evidence");
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [
          { status: "rejected", text: "A sudden traffic surge" },
          { status: "confirmed", text: "Retries amplify the upstream failure" },
        ],
        panels: [requestsVersusUsers, attemptsGroupedRetries],
      }),
    ).toBe("diagnosed");
  });

  it("does not infer progress from arbitrary panels or unrelated hypothesis state", () => {
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [{ status: "rejected", text: "The database is saturated" }],
        panels: [unrelatedPanel, unrelatedPanel, unrelatedPanel],
      }),
    ).toBe("orient");
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [{ status: "confirmed", text: "A sudden traffic surge" }],
        panels: [requestsVersusUsers, attemptsGroupedRetries],
      }),
    ).toBe("orient");
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [
          { status: "rejected", text: "A sudden traffic spike" },
          { status: "confirmed", text: "Retry amplification in payment calls" },
        ],
        panels: [requestsVersusUsers],
      }),
    ).toBe("evidence");
  });

  it("accepts a direct evidence-backed diagnosis without forcing the decoy path", () => {
    expect(
      investigationStage({
        hasClosedIncident: false,
        hasOpenIncident: true,
        hypotheses: [{ status: "confirmed", text: "Immediate retries amplified payment calls" }],
        panels: [attemptsGroupedRetries],
      }),
    ).toBe("diagnosed");
  });

  it("distinguishes an active recovery from cleared telemetry", () => {
    const shared = {
      hasClosedIncident: false,
      hasDeployEvent: true,
      hasOpenIncident: true,
      hypotheses: [],
      panels: [unrelatedPanel],
    };
    expect(investigationStage({ ...shared, hasFiringAlert: true })).toBe("recovering");
    expect(investigationStage({ ...shared, hasFiringAlert: false })).toBe("recovered");
  });
});
