import { describe, expect, it } from "vite-plus/test";

import {
  activeThreshold,
  formatPanelValue,
  reducePanelValues,
  summarizeValues,
} from "./panel-format";

describe("panel value formatting", () => {
  it("formats the complete unit vocabulary", () => {
    expect(formatPanelValue(1_234.5, { _tag: "number", format: "decimal", decimals: 1 })).toBe(
      "1,234.5",
    );
    expect(formatPanelValue(1_234, { _tag: "number", format: "short" })).toBe("1.23K");
    expect(formatPanelValue(0.125, { _tag: "percent", input: "ratio", decimals: 1 })).toBe("12.5%");
    expect(
      formatPanelValue(1_500, { _tag: "duration", input: "ms", display: "s", decimals: 1 }),
    ).toBe("1.5 s");
    expect(
      formatPanelValue(1_048_576, { _tag: "bytes", input: "B", base: "binary", decimals: 1 }),
    ).toBe("1.0 MiB");
    expect(
      formatPanelValue(2, { _tag: "rate", per: "minute", noun: "requests", decimals: 0 }),
    ).toBe("120 requests/min");
    expect(
      formatPanelValue(42, { _tag: "custom", symbol: "$", position: "before", decimals: 0 }),
    ).toBe("$42");
    expect(formatPanelValue(512, { _tag: "auto" }, "By")).toBe("512 B");
  });

  it("reduces and summarizes values deterministically", () => {
    expect(reducePanelValues([3, 6, 9], "avg")).toBe(6);
    expect(reducePanelValues([3, 6, 9], "last")).toBe(9);
    expect(summarizeValues([3, 6, 9], ["last", "min", "max", "avg"])).toEqual([
      { label: "last", value: 9 },
      { label: "min", value: 3 },
      { label: "max", value: 9 },
      { label: "avg", value: 6 },
    ]);
  });

  it("selects the most severe matching stat threshold", () => {
    expect(
      activeThreshold(95, [
        { value: 80, condition: "at_or_above", severity: "warning" },
        { value: 90, condition: "above", severity: "critical" },
      ]),
    ).toMatchObject({ severity: "critical" });
  });
});
