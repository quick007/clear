import { ProjectId } from "@groundtruth/domain";
import { describe, expect, it } from "vite-plus/test";

import { isTelemetryQueryKey, liveTelemetryRefreshMilliseconds } from "./telemetry-refresh";

const projectId = ProjectId.make("00000000-0000-7000-8000-000000000001");

describe("telemetry refresh query selection", () => {
  it("slows large active boards enough to preserve request-budget headroom", () => {
    expect(liveTelemetryRefreshMilliseconds(4)).toBe(5_000);
    expect(liveTelemetryRefreshMilliseconds(12)).toBe(5_000);
    expect(liveTelemetryRefreshMilliseconds(13)).toBe(15_000);
    expect(liveTelemetryRefreshMilliseconds(49)).toBe(15_000);
  });

  it.each([
    ["overview"],
    ["panels", "panel-1", 1],
    ["metrics", "explore", "http.server.requests"],
    ["logs", "search"],
    ["traces", "search"],
    ["alerts"],
  ])("refreshes live %s queries", (...suffix) => {
    expect(isTelemetryQueryKey(["groundtruth", String(projectId), ...suffix], projectId)).toBe(
      true,
    );
  });

  it.each([["board"], ["metrics", "catalog"], ["incidents"], ["deploys", "list"]])(
    "does not poll stable %s queries",
    (...suffix) => {
      expect(isTelemetryQueryKey(["groundtruth", String(projectId), ...suffix], projectId)).toBe(
        false,
      );
    },
  );
});
