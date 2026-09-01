import * as stylex from "@stylexjs/stylex";

import { colors, radii } from "../theme/tokens.stylex";

export const navigationStyles = stylex.create({
  link: {
    alignItems: "center",
    borderLeftColor: "transparent",
    borderLeftStyle: "solid",
    borderLeftWidth: 2,
    borderRadius: radii.sm,
    color: { default: colors.textMuted, ":hover": colors.text },
    display: "grid",
    fontSize: 12,
    fontWeight: 500,
    gap: 10,
    gridTemplateColumns: "18px minmax(0, 1fr) auto",
    minHeight: 38,
    paddingInline: 10,
    textDecoration: "none",
    ":hover": { backgroundColor: colors.whiteWash },
  },
  linkActive: {
    backgroundColor: colors.surfaceRaised,
    borderLeftColor: colors.textMuted,
    color: colors.text,
  },
  end: { alignItems: "center", display: "flex" },
});
