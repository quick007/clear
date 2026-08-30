import { describe, expect, it, vi } from "vite-plus/test";

import { claimCheckout, nextCheckoutAttempt, releaseCheckout } from "./checkout-attempt";

describe("nextCheckoutAttempt", () => {
  it("reuses the idempotency key when an ambiguous request is retried", () => {
    const createRequestId = vi.fn(() => "request_1");
    const first = nextCheckoutAttempt(null, { amountCents: 16_058, itemCount: 1 }, createRequestId);
    const retry = nextCheckoutAttempt(
      first,
      { amountCents: 16_058, itemCount: 1 },
      createRequestId,
    );

    expect(retry).toBe(first);
    expect(createRequestId).toHaveBeenCalledOnce();
  });

  it("starts a new checkout attempt when the order changes", () => {
    const createRequestId = vi
      .fn<() => string>()
      .mockReturnValueOnce("request_1")
      .mockReturnValueOnce("request_2");
    const first = nextCheckoutAttempt(null, { amountCents: 16_058, itemCount: 1 }, createRequestId);
    const changed = nextCheckoutAttempt(
      first,
      { amountCents: 32_116, itemCount: 2 },
      createRequestId,
    );

    expect(changed.requestId).toBe("request_2");
    expect(createRequestId).toHaveBeenCalledTimes(2);
  });

  it("admits only one checkout until the active request settles", () => {
    const lock = { current: false };

    expect(claimCheckout(lock)).toBe(true);
    expect(claimCheckout(lock)).toBe(false);
    releaseCheckout(lock);
    expect(claimCheckout(lock)).toBe(true);
  });
});
