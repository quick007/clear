import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { calculateOrder } from "../pricing";
import {
  CheckoutBusy,
  CheckoutClientFailure,
  CheckoutProtocolFailure,
  CheckoutRateLimited,
  CheckoutRequestRejected,
  CheckoutRequestTooLarge,
  CheckoutServerFailure,
  CheckoutTransportFailure,
  PaymentUnavailable,
} from "../checkout-api";
import { OrderSummary } from "./order-summary";

vi.mock("@stylexjs/stylex", () => ({
  create: (rules: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.keys(rules).map((name) => [name, name])),
  defineVars: (tokens: Readonly<Record<string, string>>) => tokens,
  props: (...names: ReadonlyArray<string | false>) => ({
    "data-style": names.filter(Boolean).join(" "),
  }),
}));

describe("OrderSummary", () => {
  it("locks the order controls while checkout is pending", () => {
    const html = renderToStaticMarkup(
      <OrderSummary
        onPlaceOrder={() => undefined}
        onQuantityChange={() => undefined}
        onReload={() => undefined}
        order={calculateOrder(2)}
        quantity={2}
        submission={{ status: "pending" }}
      />,
    );

    expect(html).toMatch(/aria-label="Decrease quantity"[^>]*disabled/);
    expect(html).toMatch(/aria-label="Increase quantity"[^>]*disabled/);
    expect(html).toContain("Placing order");
  });

  it("enforces Retry-After before offering another checkout attempt", () => {
    const html = renderToStaticMarkup(
      <OrderSummary
        onPlaceOrder={() => undefined}
        onQuantityChange={() => undefined}
        onReload={() => undefined}
        order={calculateOrder(2)}
        quantity={2}
        submission={{
          error: new CheckoutBusy({ retryAfterSeconds: 12 }),
          status: "error",
        }}
      />,
    );

    expect(html).toMatch(/disabled[^>]*>Try again in 12 seconds</);
    expect(html).toContain("Please wait before trying again.");
  });

  it.each([
    new PaymentUnavailable({}),
    new CheckoutRateLimited({}),
    new CheckoutBusy({}),
    new CheckoutServerFailure(),
    new CheckoutTransportFailure(),
    new CheckoutProtocolFailure(),
  ])("offers retry for transient $._tag failures", (failure) => {
    const html = renderFailure(failure);

    expect(html).toContain(">Try again</button>");
    expect(html).not.toContain("Reload checkout");
  });

  it.each([
    new CheckoutRequestRejected(),
    new CheckoutRequestTooLarge(),
    new CheckoutClientFailure(),
  ])("offers reload instead of blind retry for $._tag", (failure) => {
    const html = renderFailure(failure);

    expect(html).toContain(">Reload checkout</button>");
    expect(html).not.toContain(">Try again</button>");
  });
});

const renderFailure = (
  failure:
    | CheckoutBusy
    | CheckoutClientFailure
    | CheckoutProtocolFailure
    | CheckoutRateLimited
    | CheckoutRequestRejected
    | CheckoutRequestTooLarge
    | CheckoutServerFailure
    | CheckoutTransportFailure
    | PaymentUnavailable,
) =>
  renderToStaticMarkup(
    <OrderSummary
      onPlaceOrder={() => undefined}
      onQuantityChange={() => undefined}
      onReload={() => undefined}
      order={calculateOrder(2)}
      quantity={2}
      submission={{ error: failure, status: "error" }}
    />,
  );
