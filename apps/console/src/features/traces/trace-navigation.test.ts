import { describe, expect, it } from "vite-plus/test";

import { traceContextPath, traceExplorerSearch } from "./trace-navigation";

describe("trace navigation", () => {
  const context = {
    query: "checkout failed",
    service: "checkout/api",
    source: "logs" as const,
    window: "6h" as const,
  };

  it("preserves the originating Explore search", () => {
    expect(traceExplorerSearch(context)).toEqual({
      metric: undefined,
      query: "checkout failed",
      service: "checkout/api",
      signal: "logs",
      trace: undefined,
      window: "6h",
    });
  });

  it("encodes context in recovery paths", () => {
    expect(traceContextPath("/explore", context, true)).toBe(
      "/explore?window=6h&signal=logs&service=checkout%2Fapi&query=checkout+failed",
    );
    expect(traceContextPath("/traces/abc", context)).toBe(
      "/traces/abc?window=6h&source=logs&service=checkout%2Fapi&query=checkout+failed",
    );
  });
});
