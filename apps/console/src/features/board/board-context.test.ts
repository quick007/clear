import { describe, expect, it } from "vite-plus/test";

import { boardContextMessage, boardDependencyState } from "./board-context";

describe("board dependency recovery", () => {
  it("makes missing metric units visible instead of silently formatting without them", () => {
    expect(
      boardContextMessage({
        board: "available",
        catalog: "missing",
        incidentHistory: "available",
        overview: "available",
      }),
    ).toBe("Metric details could not be loaded. Some values may appear without units.");
  });

  it("explains which stale dependencies remain visible", () => {
    expect(
      boardContextMessage({
        board: "stale",
        catalog: "stale",
        incidentHistory: "available",
        overview: "stale",
      }),
    ).toBe(
      "Board configuration could not be refreshed. Showing the last loaded panels. Metric details could not be refreshed. Values use the last loaded units where available. Project and incident status use the last loaded data.",
    );
  });

  it("pauses the walkthrough when incident history is unavailable", () => {
    expect(
      boardContextMessage({
        board: "available",
        catalog: "available",
        incidentHistory: "missing",
        overview: "available",
      }),
    ).toBe("Investigation history could not be loaded, so walkthrough actions are paused.");
  });

  it("distinguishes initial context loading from an unavailable dependency", () => {
    expect(boardDependencyState(false, false)).toBe("loading");
    expect(boardDependencyState(true, false)).toBe("missing");
    expect(boardDependencyState(true, true)).toBe("stale");
    expect(boardDependencyState(false, true)).toBe("available");
    expect(
      boardContextMessage({
        board: "available",
        catalog: "loading",
        incidentHistory: "loading",
        overview: "loading",
      }),
    ).toBe(
      "Loading metric details. Loading project and incident status. Loading investigation history.",
    );
  });
});
