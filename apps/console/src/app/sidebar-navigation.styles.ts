import * as stylex from "@stylexjs/stylex";

import { colors, radii } from "../theme/tokens.stylex";

export const navigationStyles = stylex.create({
  link: {
    alignItems: "center",
    borderColor: "transparent",
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: radii.md,
    color: { default: colors.textMuted, ":hover": colors.text },
    display: "grid",
    fontSize: 12,
    fontWeight: 500,
    gap: 10,
    gridTemplateColumns: "18px minmax(0, 1fr) auto",
    minHeight: 40,
    paddingInline: 11,
    textDecoration: "none",
    ":hover": { backgroundColor: colors.whiteWash },
  },
  linkActive: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    color: colors.text,
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.025)",
  },
  end: { alignItems: "center", display: "flex" },
});
