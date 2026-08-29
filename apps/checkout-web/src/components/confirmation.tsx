import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { colors, radii, space } from "../theme/tokens.stylex";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { PageFooter, PageFrame, PageHeader } from "./page-frame";

export function Confirmation({ authorizationId }: { authorizationId: string }) {
  const orderNumber = authorizationId.slice(-8).toUpperCase();
  return (
    <PageFrame>
      <PageHeader />
      <main {...stylex.props(styles.main)}>
        <div {...stylex.props(styles.icon)}>
          <Icon icon={CheckmarkCircle02Icon} size={32} />
        </div>
        <p {...stylex.props(styles.label)}>Order confirmed</p>
        <h1 {...stylex.props(styles.title)}>Thank you. Your order is confirmed.</h1>
        <p {...stylex.props(styles.body)}>
          Your order has been placed. Keep the order number below for reference.
        </p>
        <div {...stylex.props(styles.card)}>
          <span {...stylex.props(styles.cardLabel)}>Order number</span>
          <strong {...stylex.props(styles.cardValue)}>{orderNumber}</strong>
        </div>
        <Button kind="primary" onClick={() => window.location.reload()}>
          Start another order
        </Button>
      </main>
      <PageFooter />
    </PageFrame>
  );
}

const styles = stylex.create({
  main: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    marginInline: "auto",
    maxWidth: 640,
    padding: "80px 24px",
    textAlign: "center",
    width: "100%",
  },
  icon: {
    alignItems: "center",
    backgroundColor: colors.greenWash,
    borderRadius: radii.pill,
    color: colors.green,
    display: "flex",
    height: 64,
    justifyContent: "center",
    marginBottom: space.x6,
    width: 64,
  },
  label: {
    color: colors.green,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    marginBlock: 0,
  },
  title: {
    fontFamily: "Georgia, serif",
    fontSize: { default: 42, "@media (max-width: 600px)": 34 },
    fontWeight: 400,
    letterSpacing: "-0.035em",
    lineHeight: 1.13,
    marginBlock: "14px 12px",
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 1.6,
    marginBlock: 0,
    maxWidth: 450,
  },
  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBlock: space.x8,
    maxWidth: 280,
    padding: space.x5,
    width: "100%",
  },
  cardLabel: { color: colors.muted, fontSize: 12 },
  cardValue: { fontSize: 15 },
});
