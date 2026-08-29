import { describe, expect, it } from "vite-plus/test";

import { traceSpanGeometry } from "./trace-geometry";

describe("traceSpanGeometry", () => {
  it("preserves sub-ten-percent spans", () => {
    const geometry = traceSpanGeometry(0.123, 0.017);
    expect(geometry.x).toBeCloseTo(12.3);
    expect(geometry.width).toBeCloseTo(1.7);
  });

  it("clamps spans to the visible waterfall", () => {
    expect(traceSpanGeometry(-0.1, 0.2)).toEqual({ width: 20, x: 0 });
    expect(traceSpanGeometry(0.92, 0.2)).toEqual({ width: 8, x: 92 });
  });
});
