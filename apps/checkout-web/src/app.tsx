import * as stylex from "@stylexjs/stylex";
import { Effect, Exit } from "effect";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckoutClientFailure,
  CheckoutServerFailure,
  createCheckout,
  type CheckoutFailure,
} from "./checkout-api";
import {
  claimCheckout,
  nextCheckoutAttempt,
  releaseCheckout,
  type CheckoutAttempt,
} from "./checkout-attempt";
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
  const attemptRef = useRef<CheckoutAttempt | null>(null);
  const inFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const order = useMemo(() => calculateOrder(quantity), [quantity]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const placeOrder = () => {
    if (submission.status === "pending" || !claimCheckout(inFlightRef)) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setSubmission({ status: "pending" });
    const checkout = Effect.gen(function* () {
      const attempt = yield* Effect.try({
        try: () =>
          nextCheckoutAttempt(attemptRef.current, {
            amountCents: order.totalCents,
            itemCount: quantity,
          }),
        catch: () => new CheckoutClientFailure(),
      });
      yield* Effect.sync(() => {
        attemptRef.current = attempt;
      });
      const userId = yield* Effect.try({
        try: getUserId,
        catch: () => new CheckoutClientFailure(),
      });
      return yield* createCheckout({
        amountCents: attempt.amountCents,
        itemCount: attempt.itemCount,
        requestId: attempt.requestId,
        signal: controller.signal,
        userId,
      });
    }).pipe(
      Effect.match({
        onFailure: (error) =>
          error._tag === "CheckoutCancelled"
            ? { _tag: "CheckoutCancelled" as const }
            : { _tag: "CheckoutFailure" as const, error },
        onSuccess: (result) => ({ _tag: "CheckoutSuccess" as const, result }),
      }),
    );

    void Effect.runPromiseExit(checkout).then(
      Exit.match({
        onFailure: () => {
          if (!isMountedRef.current || abortRef.current !== controller) return;
          abortRef.current = null;
          releaseCheckout(inFlightRef);
          setSubmission({ error: new CheckoutServerFailure(), status: "error" });
        },
        onSuccess: (outcome) => {
          if (!isMountedRef.current || abortRef.current !== controller) return;
          abortRef.current = null;
          releaseCheckout(inFlightRef);

          if (outcome._tag === "CheckoutCancelled") {
            setSubmission({ status: "idle" });
          } else if (outcome._tag === "CheckoutFailure") {
            setSubmission({ error: outcome.error, status: "error" });
          } else {
            attemptRef.current = null;
            setSubmission({ authorizationId: outcome.result.authorizationId, status: "success" });
          }
        },
      }),
    );
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
          onReload={() => window.location.reload()}
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
