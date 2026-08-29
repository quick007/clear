import * as stylex from "@stylexjs/stylex";

export { colorValues } from "./color-values";

export const colors = stylex.defineVars({
  accent: "#8a4d2d",
  accentHover: "#743e24",
  accentWash: "#f2e8df",
  canvas: "#f5f2ec",
  critical: "#a03d34",
  criticalWash: "#f8e7e3",
  green: "#49624b",
  greenWash: "#e6eee5",
  ink: "#201e1a",
  line: "#d9d3c8",
  lineStrong: "#c7bfb2",
  muted: "#706b63",
  subtle: "#746e65",
  surface: "#fffdfa",
  surfaceMuted: "#eeeae2",
  white: "#ffffff",
});

export const radii = stylex.defineVars({
  lg: "20px",
  md: "12px",
  pill: "999px",
  sm: "8px",
});

export const space = stylex.defineVars({
  x1: "4px",
  x2: "8px",
  x3: "12px",
  x4: "16px",
  x5: "20px",
  x6: "24px",
  x8: "32px",
  x10: "40px",
  x12: "48px",
});
