import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  checkoutFailurePresentation,
  checkoutRetryAfterSeconds,
  createCheckout,
} from "./checkout-api";

const request = {
  amountCents: 16_058,
  itemCount: 1,
  requestId: "request_123",
  userId: "user_123",
};

beforeEach(() => vi.stubEnv("VITE_CHECKOUT_API_URL", "https://checkout-api.clear.test"));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const failureFor = () => Effect.runPromise(createCheckout(request).pipe(Effect.flip));

describe("createCheckout", () => {
  it("makes exactly one browser request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authorizationId: "auth_123",
          requestId: "req_123",
          status: "confirmed",
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );

    await expect(Effect.runPromise(createCheckout(request))).resolves.toMatchObject({
      status: "confirmed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(typeof init?.body).toBe("string");
    if (typeof init?.body === "string") {
      expect(JSON.parse(init.body)).toMatchObject({ requestId: "request_123" });
    }
  });

  it.each([
    ["invalid_request", 400, "CheckoutRequestRejected"],
    ["payments_unavailable", 503, "PaymentUnavailable"],
    ["request_too_large", 413, "CheckoutRequestTooLarge"],
    ["rate_limited", 429, "CheckoutRateLimited"],
    ["checkout_busy", 503, "CheckoutBusy"],
    ["internal_error", 500, "CheckoutServerFailure"],
  ] as const)("maps %s to a typed local failure", async (code, status, tag) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code,
          message: "upstream response",
          ...(code === "payments_unavailable" ? { requestFailedAtAttempt: 3 } : {}),
        }),
        { status },
      ),
    );

    await expect(failureFor()).resolves.toMatchObject({ _tag: tag });
  });

  it("preserves Retry-After for a recoverable capacity response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "checkout_busy", message: "busy" }), {
        headers: { "retry-after": "12" },
        status: 503,
      }),
    );

    const failure = await failureFor();
    expect(failure).toMatchObject({ _tag: "CheckoutBusy", retryAfterSeconds: 12 });
    expect(checkoutFailurePresentation(failure)).toMatchObject({
      actionLabel: "Try again",
      recovery: "retry",
    });
    expect(checkoutRetryAfterSeconds(failure)).toBe(12);
  });

  it("models a rejected browser request separately from server failures", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(failureFor()).resolves.toMatchObject({ _tag: "CheckoutTransportFailure" });
  });

  it("models cancellation silently", async () => {
    const abortError = new Error("Request aborted");
    abortError.name = "AbortError";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(abortError);

    await expect(failureFor()).resolves.toMatchObject({ _tag: "CheckoutCancelled" });
  });

  it("rejects malformed success payloads as protocol failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ authorizationId: 123, requestId: "req_123", status: "confirmed" }),
        { status: 200 },
      ),
    );

    await expect(failureFor()).resolves.toMatchObject({ _tag: "CheckoutProtocolFailure" });
  });

  it("rejects malformed error payloads as protocol failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "payments_unavailable", message: false }), {
        status: 503,
      }),
    );

    await expect(failureFor()).resolves.toMatchObject({ _tag: "CheckoutProtocolFailure" });
  });
});
