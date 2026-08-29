import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";
import { colors, radii, space } from "../theme/tokens.stylex";

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className"> & {
  children: ReactNode;
  kind?: "primary" | "quiet" | "outline";
  wide?: boolean;
};

export function Button({ children, kind = "outline", wide = false, ...props }: ButtonProps) {
  return (
    <BaseButton {...props} {...stylex.props(styles.base, kinds[kind], wide && styles.wide)}>
      {children}
    </BaseButton>
  );
}

const styles = stylex.create({
  base: {
    alignItems: "center",
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 600,
    gap: space.x2,
    height: 44,
    justifyContent: "center",
    paddingInline: space.x4,
    transitionDuration: "140ms",
    transitionProperty: "background-color, border-color, color, opacity",
    userSelect: "none",
    ":disabled": { cursor: "not-allowed", opacity: 0.54 },
    ":focus-visible": { outline: `3px solid ${colors.accent}`, outlineOffset: 2 },
  },
  wide: { width: "100%" },
});

const kinds = stylex.create({
  primary: {
    backgroundColor: { default: colors.ink, ":hover": "#34312b" },
    borderColor: colors.ink,
    color: "#ffffff",
  },
  outline: {
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    borderColor: colors.lineStrong,
    color: colors.ink,
  },
  quiet: {
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    borderColor: "transparent",
    color: colors.muted,
  },
});
