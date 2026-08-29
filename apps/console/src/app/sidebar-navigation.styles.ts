import * as stylex from "@stylexjs/stylex";

import { colors, radii, space } from "../theme/tokens.stylex";

export const navigationStyles = stylex.create({
  link: {
    alignItems: "center",
    borderRadius: radii.sm,
    color: { default: colors.textMuted, ":hover": colors.text },
    display: "grid",
    fontSize: 13,
    fontWeight: 500,
    gap: space.x3,
    gridTemplateColumns: "20px minmax(0, 1fr) auto",
    minHeight: 42,
    paddingInline: space.x3,
    textDecoration: "none",
    ":hover": { backgroundColor: colors.whiteWash },
  },
  linkActive: { backgroundColor: colors.surfaceRaised, color: colors.text },
  end: { alignItems: "center", display: "flex" },
});
