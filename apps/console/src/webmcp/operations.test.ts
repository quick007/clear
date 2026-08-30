import { LogSearch, TraceSearch } from "@groundtruth/telemetry";
import { describe, expect, it } from "vite-plus/test";

import { makeLogSearch, makeTraceSearch } from "./operations";

describe("WebMCP telemetry search payloads", () => {
  it("constructs Effect log search payloads with bounded defaults", () => {
    const payload = makeLogSearch({ window: "15m" });

    expect(payload).toBeInstanceOf(LogSearch);
    expect(payload.limit).toBe(30);
    expect(payload.range).toEqual({ _tag: "relative", window: "15m" });
  });

  it("constructs Effect trace search payloads with bounded defaults", () => {
    const payload = makeTraceSearch({ status: "error", window: "1h" });

    expect(payload).toBeInstanceOf(TraceSearch);
    expect(payload.limit).toBe(30);
    expect(payload.range).toEqual({ _tag: "relative", window: "1h" });
  });
});
