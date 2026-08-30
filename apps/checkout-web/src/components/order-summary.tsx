import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { Effect } from "effect";
import { useEffect, useState } from "react";
import productImage from "../assets/ridge-weekender.webp";
import type { Submission } from "../app";
import {
  checkoutFailurePresentation,
  checkoutRetryAfterSeconds,
  type CheckoutFailure,
} from "../checkout-api";
import { calculateOrder, formatMoney } from "../pricing";
import { runRetryCountdown } from "../retry-countdown";
import { colors, radii, space } from "../theme/tokens.stylex";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

type Order = ReturnType<typeof calculateOrder>;

export function OrderSummary({
  onPlaceOrder,
  onQuantityChange,
  onReload,
  order,
  quantity,
  submission,
}: {
  onPlaceOrder: () => void;
  onQuantityChange: (quantity: number) => void;
  onReload: () => void;
  order: Order;
  quantity: number;
  submission: Exclude<Submission, { status: "success" }>;
}) {
  const failure =
    submission.status === "error" ? checkoutFailurePresentation(submission.error) : undefined;

  return (
    <aside aria-label="Order summary" {...stylex.props(styles.summary)}>
      <h2 {...stylex.props(styles.summaryTitle)}>Order summary</h2>
      <div {...stylex.props(styles.product)}>
        <div {...stylex.props(styles.productImageWrap)}>
          <img
            alt="Graphite Ridge Weekender bag"
            src={productImage}
            {...stylex.props(styles.productImage)}
          />
        </div>
        <div {...stylex.props(styles.productDetails)}>
          <div>
            <h3 {...stylex.props(styles.productName)}>Ridge Weekender</h3>
            <p {...stylex.props(styles.variant)}>Graphite · 32 L</p>
          </div>
          <span {...stylex.props(styles.price)}>{formatMoney(14_800)}</span>
          <Quantity
            disabled={submission.status === "pending"}
            value={quantity}
            onChange={onQuantityChange}
          />
        </div>
      </div>
      <dl {...stylex.props(styles.totals)}>
        <Total label="Subtotal" value={formatMoney(order.subtotalCents)} />
        <Total label="Shipping" value="Complimentary" />
        <Total label="Estimated tax" value={formatMoney(order.taxCents)} />
        <Total emphasis label="Total" value={formatMoney(order.totalCents)} />
      </dl>
      {failure === undefined ? null : (
        <div role="alert" {...stylex.props(styles.error)}>
          <strong>{failure.title}</strong>
          <span>{failure.detail}</span>
        </div>
      )}
      {submission.status === "error" ? (
        <FailureAction failure={submission.error} onReload={onReload} onRetry={onPlaceOrder} />
      ) : (
        <>
          <Button
            aria-describedby="request-status"
            disabled={submission.status === "pending"}
            kind="primary"
            onClick={onPlaceOrder}
            wide
          >
            {submission.status === "pending"
              ? "Placing order…"
              : `Place order · ${formatMoney(order.totalCents)}`}
          </Button>
          <p aria-live="polite" id="request-status" {...stylex.props(styles.requestStatus)}>
            {submission.status === "pending"
              ? "Confirming your order."
              : "Review your order, then place it when ready."}
          </p>
        </>
      )}
    </aside>
  );
}

function FailureAction({
  failure,
  onReload,
  onRetry,
}: {
  failure: CheckoutFailure;
  onReload: () => void;
  onRetry: () => void;
}) {
  const presentation = checkoutFailurePresentation(failure);

  if (presentation.recovery === "reload") {
    return (
      <>
        <Button aria-describedby="request-status" kind="primary" onClick={onReload} wide>
          {presentation.actionLabel}
        </Button>
        <p aria-live="polite" id="request-status" {...stylex.props(styles.requestStatus)}>
          Your order is not confirmed. Reload checkout to continue.
        </p>
      </>
    );
  }

  if (presentation.recovery === "none") return null;

  return <RetryAction failure={failure} label={presentation.actionLabel} onRetry={onRetry} />;
}

function RetryAction({
  failure,
  label,
  onRetry,
}: {
  failure: CheckoutFailure;
  label: string;
  onRetry: () => void;
}) {
  const retryAfter = checkoutRetryAfterSeconds(failure) ?? 0;
  const [remaining, setRemaining] = useState(retryAfter);

  useEffect(() => {
    if (retryAfter === 0) return;
    const fiber = Effect.runFork(runRetryCountdown(retryAfter, setRemaining));
    return () => fiber.interruptUnsafe();
  }, [retryAfter]);

  const waiting = remaining > 0;
  const retryLabel = waiting
    ? `Try again in ${remaining} second${remaining === 1 ? "" : "s"}`
    : label;

  return (
    <>
      <Button
        aria-describedby="request-status"
        disabled={waiting}
        kind="primary"
        onClick={onRetry}
        wide
      >
        {retryLabel}
      </Button>
      <p aria-live="polite" id="request-status" {...stylex.props(styles.requestStatus)}>
        {waiting
          ? "Your order is not confirmed. Please wait before trying again."
          : "Your order is not confirmed. You can try again now."}
      </p>
    </>
  );
}

function Quantity({
  disabled,
  value,
  onChange,
}: {
  disabled: boolean;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div aria-label="Quantity" {...stylex.props(styles.quantity)}>
      <button
        aria-label="Decrease quantity"
        disabled={disabled || value === 1}
        onClick={() => onChange(value - 1)}
        type="button"
        {...stylex.props(styles.quantityButton)}
      >
        <Icon icon={MinusSignIcon} size={14} />
      </button>
      <output aria-label={`${value} items`} {...stylex.props(styles.quantityValue)}>
        {value}
      </output>
      <button
        aria-label="Increase quantity"
        disabled={disabled || value === 4}
        onClick={() => onChange(value + 1)}
        type="button"
        {...stylex.props(styles.quantityButton)}
      >
        <Icon icon={PlusSignIcon} size={14} />
      </button>
    </div>
  );
}

function Total({
  emphasis = false,
  label,
  value,
}: {
  emphasis?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div {...stylex.props(styles.totalRow, emphasis && styles.totalEmphasis)}>
      <dt>{label}</dt>
      <dd {...stylex.props(styles.totalValue)}>{value}</dd>
    </div>
  );
}

const styles = stylex.create({
  summary: {
    alignSelf: "start",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    padding: { default: space.x6, "@media (max-width: 500px)": space.x5 },
    position: { default: "sticky", "@media (max-width: 900px)": "static" },
    top: space.x6,
  },
  summaryTitle: {
    fontFamily: "Georgia, serif",
    fontSize: 22,
    fontWeight: 400,
    letterSpacing: "-0.02em",
    marginBlock: "0 20px",
  },
  product: {
    display: "grid",
    gap: space.x4,
    gridTemplateColumns: { default: "104px 1fr", "@media (max-width: 380px)": "84px 1fr" },
    paddingBottom: space.x6,
  },
  productImageWrap: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    height: { default: 118, "@media (max-width: 380px)": 100 },
    overflow: "hidden",
  },
  productImage: { height: "100%", objectFit: "cover", width: "100%" },
  productDetails: { display: "flex", flexDirection: "column", minWidth: 0 },
  productName: { fontSize: 15, fontWeight: 600, marginBlock: "3px 0" },
  variant: { color: colors.muted, fontSize: 13, marginBlock: 3 },
  price: { color: colors.muted, fontSize: 13, marginBottom: "auto", marginTop: 1 },
  quantity: {
    alignItems: "center",
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    height: 44,
    width: { default: 132, "@media (max-width: 380px)": 120 },
  },
  quantityButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    cursor: "pointer",
    display: "flex",
    height: 42,
    justifyContent: "center",
    padding: 0,
    width: { default: 44, "@media (max-width: 380px)": 40 },
    ":disabled": { cursor: "not-allowed", opacity: 0.28 },
    ":focus-visible": { borderRadius: radii.pill, outline: `2px solid ${colors.accent}` },
  },
  quantityValue: {
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 12,
    textAlign: "center",
    width: { default: 44, "@media (max-width: 380px)": 40 },
  },
  totals: {
    borderBlockColor: colors.line,
    borderBlockStyle: "solid",
    borderBlockWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: space.x3,
    marginBlock: 0,
    paddingBlock: space.x5,
  },
  totalRow: {
    color: colors.muted,
    display: "flex",
    fontSize: 14,
    justifyContent: "space-between",
  },
  totalValue: { margin: 0 },
  totalEmphasis: { color: colors.ink, fontSize: 16, fontWeight: 600, marginTop: space.x2 },
  error: {
    backgroundColor: colors.criticalWash,
    borderRadius: radii.sm,
    color: colors.critical,
    display: "flex",
    flexDirection: "column",
    fontSize: 13,
    gap: 3,
    lineHeight: 1.4,
    marginBlock: space.x5,
    padding: space.x3,
  },
  requestStatus: {
    color: colors.subtle,
    fontSize: 12,
    marginBlock: "10px 0 0",
    minHeight: 18,
    textAlign: "center",
  },
});
