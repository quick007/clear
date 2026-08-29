import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { colors, radii, space } from "../theme/tokens.stylex";

type Tone = "healthy" | "attention" | "critical" | "neutral" | "info";

export function StatusDot({ tone = "neutral" }: { tone?: Tone }) {
  return <span aria-hidden {...stylex.props(styles.dot, toneStyles[tone])} />;
}

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span {...stylex.props(styles.pill, pillToneStyles[tone])}>
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}

const toneStyles = stylex.create({
  healthy: { backgroundColor: colors.green },
  attention: { backgroundColor: colors.amber },
  critical: { backgroundColor: colors.red },
  neutral: { backgroundColor: colors.textSubtle },
  info: { backgroundColor: colors.blue },
});

const pillToneStyles = stylex.create({
  healthy: { backgroundColor: colors.greenWash, color: colors.green },
  attention: { backgroundColor: colors.amberWash, color: colors.amber },
  critical: { backgroundColor: colors.redWash, color: colors.red },
  neutral: { backgroundColor: colors.whiteWash, color: colors.textMuted },
  info: { backgroundColor: colors.blueWash, color: colors.blue },
});

const styles = stylex.create({
  dot: { borderRadius: radii.pill, height: 6, width: 6 },
  pill: {
    alignItems: "center",
    borderRadius: radii.pill,
    display: "inline-flex",
    fontSize: 12,
    fontWeight: 500,
    gap: space.x2,
    lineHeight: 1,
    paddingBlock: 6,
    paddingInline: 9,
    whiteSpace: "nowrap",
  },
});
