import { CreditCardIcon, DeliveryTruck01Icon, LockKeyIcon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, radii, space } from "../theme/tokens.stylex";
import { Icon } from "../ui/icon";

export function CheckoutDetails() {
  return (
    <section {...stylex.props(styles.checkout)}>
      <div {...stylex.props(styles.headingGroup)}>
        <h1 {...stylex.props(styles.title)}>Review your order</h1>
        <p {...stylex.props(styles.lede)}>
          Your saved details are ready. Confirm everything below.
        </p>
      </div>
      <DetailSection
        icon={DeliveryTruck01Icon}
        label="Delivery"
        primary="Mara Ellis"
        secondary={
          <>
            175 Clement Street
            <br />
            San Francisco, CA 94118
          </>
        }
      />
      <DetailSection
        icon={CreditCardIcon}
        label="Payment"
        primary="Visa ending in 4242"
        secondary="Expires 09/29"
      />
      <div {...stylex.props(styles.notice)}>
        <Icon icon={LockKeyIcon} size={17} />
        <span>Your saved payment method will be charged only after the order is confirmed.</span>
      </div>
    </section>
  );
}

function DetailSection({
  icon,
  label,
  primary,
  secondary,
}: {
  icon: Parameters<typeof Icon>[0]["icon"];
  label: string;
  primary: string;
  secondary: ReactNode;
}) {
  return (
    <section {...stylex.props(styles.detailSection)}>
      <div {...stylex.props(styles.detailIcon)}>
        <Icon icon={icon} />
      </div>
      <div {...stylex.props(styles.detailCopy)}>
        <h2 {...stylex.props(styles.detailLabel)}>{label}</h2>
        <p {...stylex.props(styles.detailPrimary)}>{primary}</p>
        <p {...stylex.props(styles.detailSecondary)}>{secondary}</p>
      </div>
    </section>
  );
}

const styles = stylex.create({
  checkout: { minWidth: 0 },
  headingGroup: { marginBottom: space.x10 },
  title: {
    fontFamily: "Georgia, serif",
    fontSize: { default: 42, "@media (max-width: 700px)": 34 },
    fontWeight: 400,
    letterSpacing: "-0.035em",
    lineHeight: 1.1,
    marginBlock: 0,
  },
  lede: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 1.6,
    marginBlock: space.x3,
    maxWidth: 470,
  },
  detailSection: {
    alignItems: "flex-start",
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "grid",
    gap: space.x4,
    gridTemplateColumns: "40px 1fr",
    paddingBlock: space.x6,
  },
  detailIcon: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    color: colors.accent,
    display: "flex",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  detailCopy: { minWidth: 0 },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.02em",
    marginBlock: "1px 7px",
  },
  detailPrimary: { fontSize: 15, fontWeight: 600, marginBlock: 0 },
  detailSecondary: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 1.5,
    marginBlock: "4px 0",
  },
  notice: {
    alignItems: "flex-start",
    backgroundColor: colors.accentWash,
    borderRadius: radii.md,
    color: colors.accent,
    display: "flex",
    fontSize: 13,
    gap: space.x3,
    lineHeight: 1.5,
    marginTop: space.x5,
    padding: space.x4,
  },
});
