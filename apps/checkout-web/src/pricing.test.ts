import { describe, expect, it } from "vite-plus/test";
import { calculateOrder, formatMoney } from "./pricing";

describe("calculateOrder", () => {
  it("calculates the subtotal, tax, and total for the selected quantity", () => {
    expect(calculateOrder(2)).toEqual({
      subtotalCents: 29_600,
      taxCents: 2_442,
      totalCents: 32_042,
    });
  });

  it("formats cents as US dollars", () => {
    expect(formatMoney(16_058)).toBe("$160.58");
  });
});
