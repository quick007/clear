import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createCheckout } from "./checkout-api";

afterEach(() => vi.restoreAllMocks());

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

    await expect(
      createCheckout({ amountCents: 16_058, itemCount: 1, userId: "user_123" }),
    ).resolves.toMatchObject({ status: "confirmed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a recoverable payments error without retrying", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "payments_unavailable" }), {
        headers: { "content-type": "application/json" },
        status: 503,
      }),
    );

    await expect(
      createCheckout({ amountCents: 16_058, itemCount: 1, userId: "user_123" }),
    ).rejects.toMatchObject({ code: "payments_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
