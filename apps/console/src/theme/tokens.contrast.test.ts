import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { colorValues as checkoutColors } from "../../../checkout-web/src/theme/color-values";
import { colorValues as consoleColors } from "./color-values";

const channelToLinear = (hex: string) => {
  const channel = Number.parseInt(hex, 16) / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  const values = hex.match(/[a-f\d]{2}/gi);
  if (!values || values.length !== 3)
    throw new Error(`Expected a six-digit hex color, received ${hex}`);
  const [redHex = "", greenHex = "", blueHex = ""] = values;
  const red = channelToLinear(redHex);
  const green = channelToLinear(greenHex);
  const blue = channelToLinear(blueHex);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrast = (foreground: string, background: string) => {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

const expectAaText = (foreground: string, backgrounds: readonly string[]) => {
  for (const background of backgrounds) {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  }
};

const expectStylexTokensToMatch = (source: string, values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values)) {
    expect(source).toContain(`${name}: "${value}"`);
  }
};

describe("quiet text contrast", () => {
  it("keeps the test palettes synchronized with compiled StyleX tokens", () => {
    const consoleSource = readFileSync(new URL("./tokens.stylex.ts", import.meta.url), "utf8");
    const checkoutSource = readFileSync(
      new URL("../../../checkout-web/src/theme/tokens.stylex.ts", import.meta.url),
      "utf8",
    );

    expectStylexTokensToMatch(consoleSource, consoleColors);
    expectStylexTokensToMatch(checkoutSource, checkoutColors);
  });

  it("keeps compact console metadata readable across dark surfaces", () => {
    expectAaText(consoleColors.textMuted, [
      consoleColors.canvas,
      consoleColors.surface,
      consoleColors.surfaceRaised,
    ]);
    expectAaText(consoleColors.textSubtle, [
      consoleColors.canvas,
      consoleColors.surface,
      consoleColors.surfaceRaised,
    ]);
  });

  it("keeps storefront metadata readable across its light surfaces", () => {
    expectAaText(checkoutColors.muted, [checkoutColors.canvas, checkoutColors.surface]);
    expectAaText(checkoutColors.subtle, [checkoutColors.canvas, checkoutColors.surface]);
  });

  it("keeps keyboard focus indicators distinguishable from their canvases", () => {
    expect(contrast(consoleColors.amber, consoleColors.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(checkoutColors.accent, checkoutColors.canvas)).toBeGreaterThanOrEqual(3);
  });
});
