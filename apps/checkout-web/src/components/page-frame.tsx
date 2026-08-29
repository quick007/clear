import { LockKeyIcon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, space } from "../theme/tokens.stylex";
import { Icon } from "../ui/icon";

export function PageFrame({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.frame)}>{children}</div>;
}

export function PageHeader() {
  return (
    <header {...stylex.props(styles.header)}>
      <span {...stylex.props(styles.wordmark)}>Stillroom</span>
      <span {...stylex.props(styles.secure)}>
        <Icon icon={LockKeyIcon} size={15} /> Secure checkout
      </span>
    </header>
  );
}

export function PageFooter() {
  return (
    <footer {...stylex.props(styles.footer)}>
      <span>© 2026 Stillroom</span>
      <span>Thoughtful goods for everyday movement</span>
    </footer>
  );
}

const styles = stylex.create({
  frame: {
    backgroundColor: colors.canvas,
    color: colors.ink,
    display: "flex",
    flexDirection: "column",
    fontFamily: "IBM Plex Sans, sans-serif",
    minHeight: "100vh",
  },
  header: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    height: 72,
    justifyContent: "space-between",
    marginInline: "auto",
    maxWidth: 1180,
    paddingInline: { default: space.x8, "@media (max-width: 700px)": space.x5 },
    width: "100%",
  },
  wordmark: {
    color: colors.ink,
    fontFamily: "Georgia, serif",
    fontSize: 25,
    fontWeight: 600,
    letterSpacing: "-0.04em",
  },
  secure: { alignItems: "center", color: colors.muted, display: "flex", fontSize: 13, gap: 7 },
  footer: {
    alignItems: { default: "center", "@media (max-width: 520px)": "flex-start" },
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: colors.subtle,
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 520px)": "column" },
    fontSize: 12,
    gap: space.x4,
    justifyContent: "space-between",
    marginInline: "auto",
    maxWidth: 1180,
    paddingBlock: space.x5,
    paddingInline: { default: space.x8, "@media (max-width: 700px)": space.x5 },
    width: "100%",
  },
});
