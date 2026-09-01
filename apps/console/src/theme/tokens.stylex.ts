import * as stylex from "@stylexjs/stylex";

export { colorValues } from "./color-values";

export const colors = stylex.defineVars({
  canvas: "#080a0b",
  canvasRaised: "#0d1011",
  surface: "#111415",
  surfaceRaised: "#181c1e",
  surfaceHover: "#1e2326",
  line: "#24292c",
  lineStrong: "#3a4145",
  text: "#f0f2f2",
  textMuted: "#a5aaad",
  textSubtle: "#747b7f",
  amber: "#f5b942",
  amberStrong: "#eba72a",
  amberWash: "rgba(245, 185, 66, 0.10)",
  green: "#47c89a",
  greenWash: "rgba(71, 200, 154, 0.10)",
  red: "#f06d75",
  redWash: "rgba(240, 109, 117, 0.10)",
  blue: "#59b4f7",
  blueWash: "rgba(89, 180, 247, 0.10)",
  orange: "#f49a4a",
  violet: "#a78bfa",
  cyan: "#43c7bc",
  cyanStrong: "#2cb3a8",
  cyanWash: "rgba(67, 199, 188, 0.10)",
  whiteWash: "rgba(255, 255, 255, 0.04)",
  materialSurface: "rgba(255, 255, 255, 0.03)",
  materialSurfaceStrong: "rgba(255, 255, 255, 0.05)",
  materialLine: "rgba(255, 255, 255, 0.08)",
  materialHighlight: "rgba(255, 255, 255, 0.04)",
  overlay: "rgba(5, 7, 8, 0.80)",
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

export const radii = stylex.defineVars({
  sm: "6px",
  md: "8px",
  lg: "10px",
  pill: "999px",
});
