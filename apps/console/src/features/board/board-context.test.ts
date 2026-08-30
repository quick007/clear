import { describe, expect, it } from "vite-plus/test";

import { boardContextMessage } from "./board-context";

describe("board dependency recovery", () => {
  it("makes missing metric units visible instead of silently formatting without them", () => {
    expect(boardContextMessage({ catalog: "missing", overview: "available" })).toBe(
      "Metric details could not be loaded. Some values may appear without units.",
    );
  });

  it("explains which stale dependencies remain visible", () => {
    expect(boardContextMessage({ catalog: "stale", overview: "stale" })).toBe(
      "Metric details could not be refreshed. Values use the last loaded units where available. Project and incident status use the last loaded data.",
    );
  });
});
