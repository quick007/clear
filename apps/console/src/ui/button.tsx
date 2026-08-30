import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";

import { colors, radii, space } from "../theme/tokens.stylex";

type ButtonTone = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className"> & {
  children: ReactNode;
  compact?: boolean;
  large?: boolean;
  tone?: ButtonTone;
};

export function Button({
  children,
  compact = false,
  large = false,
  nativeButton,
  render,
  tone = "secondary",
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      nativeButton={nativeButton ?? render === undefined}
      render={render}
      {...stylex.props(
        buttonStyles.button,
        buttonToneStyles[tone],
        compact && buttonStyles.compact,
        large && buttonStyles.large,
      )}
    >
      {children}
    </BaseButton>
  );
}

export const buttonToneStyles = stylex.create({
  primary: {
    backgroundColor: { default: colors.text, ":hover": "#d6d3d1" },
    borderColor: colors.text,
    color: colors.canvas,
  },
  secondary: {
    backgroundColor: { default: colors.surface, ":hover": colors.surfaceHover },
    borderColor: colors.lineStrong,
    color: colors.text,
  },
  ghost: {
    backgroundColor: { default: "transparent", ":hover": colors.whiteWash },
    borderColor: "transparent",
    color: colors.textMuted,
  },
  danger: {
    backgroundColor: { default: colors.redWash, ":hover": "rgba(248, 113, 113, 0.16)" },
    borderColor: "rgba(248, 113, 113, 0.30)",
    color: colors.red,
  },
});

export const buttonStyles = stylex.create({
  button: {
    alignItems: "center",
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    cursor: "pointer",
    display: "inline-flex",
    fontSize: 13,
    fontWeight: 500,
    gap: space.x2,
    height: { default: 36, "@media (max-width: 620px)": 44 },
    justifyContent: "center",
    lineHeight: 1,
    paddingInline: space.x3,
    transitionDuration: "140ms",
    transitionProperty: "background-color, border-color, color, opacity",
    textDecoration: "none",
    userSelect: "none",
    whiteSpace: "nowrap",
    ":disabled": { cursor: "not-allowed", opacity: 0.45 },
  },
  compact: { height: { default: 32, "@media (max-width: 620px)": 44 }, paddingInline: 10 },
  large: { fontSize: 14, height: 44, paddingInline: 18 },
});
