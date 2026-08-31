import { describe, expect, it } from "vite-plus/test";

import { formatMetricStat } from "./explore-format";

describe("metric explorer formatting", () => {
  it("keeps catalog units attached to summary values", () => {
    expect(formatMetricStat(1_500, "ms")).toBe("1.5K ms");
    expect(formatMetricStat(512, "By")).toBe("512 B");
    expect(formatMetricStat(42, "1")).toBe("42");
  });

  it("distinguishes an empty result from a numeric zero", () => {
    expect(formatMetricStat(undefined, "ms")).toBe("No data");
    expect(formatMetricStat(null, "ms")).toBe("No data");
    expect(formatMetricStat(0, "ms")).toBe("0 ms");
  });
});
