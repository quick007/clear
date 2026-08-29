import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo, useRef, useState } from "react";
import { createCheckout, type CheckoutFailure } from "./checkout-api";
import { CheckoutDetails } from "./components/checkout-details";
import { Confirmation } from "./components/confirmation";
import { OrderSummary } from "./components/order-summary";
import { PageFooter, PageFrame, PageHeader } from "./components/page-frame";
import { calculateOrder } from "./pricing";
import { space } from "./theme/tokens.stylex";

export type Submission =
  | { status: "idle" }
  | { status: "pending" }
  | { error: CheckoutFailure; status: "error" }
  | { authorizationId: string; status: "success" };

const getUserId = () => {
  const existing = window.localStorage.getItem("stillroom-customer-id");
  if (existing) return existing;
  const value = crypto.randomUUID();
  window.localStorage.setItem("stillroom-customer-id", value);
  return value;
};

export function App() {
  const [quantity, setQuantity] = useState(1);
  const [submission, setSubmission] = useState<Submission>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const order = useMemo(() => calculateOrder(quantity), [quantity]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const placeOrder = async () => {
    if (submission.status === "pending") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setSubmission({ status: "pending" });
    try {
      const result = await createCheckout({
        amountCents: order.totalCents,
        itemCount: quantity,
        signal: controller.signal,
        userId: getUserId(),
      });
      setSubmission({ authorizationId: result.authorizationId, status: "success" });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const error =
        typeof cause === "object" && cause !== null && "code" in cause && "message" in cause
          ? (cause as CheckoutFailure)
          : ({
              code: "request_failed",
              message: "We could not place the order right now.",
            } as const);
      setSubmission({ error, status: "error" });
    }
  };

  if (submission.status === "success") {
    return <Confirmation authorizationId={submission.authorizationId} />;
  }

  return (
    <PageFrame>
      <PageHeader />
      <main {...stylex.props(styles.main)}>
        <CheckoutDetails />
        <OrderSummary
          onPlaceOrder={placeOrder}
          onQuantityChange={setQuantity}
          order={order}
          quantity={quantity}
          submission={submission}
        />
      </main>
      <PageFooter />
    </PageFrame>
  );
}

const styles = stylex.create({
  main: {
    display: "grid",
    gap: { default: 84, "@media (max-width: 900px)": space.x10 },
    gridTemplateColumns: {
      default: "minmax(0, 1fr) minmax(340px, 430px)",
      "@media (max-width: 900px)": "1fr",
    },
    marginInline: "auto",
    maxWidth: 1080,
    paddingBlock: { default: 72, "@media (max-width: 700px)": space.x10 },
    paddingInline: { default: space.x8, "@media (max-width: 700px)": space.x5 },
    width: "100%",
  },
});
