export type CheckoutResult = {
  authorizationId: string;
  requestId: string;
  status: "confirmed";
};

export type CheckoutFailure = {
  code: "invalid_request" | "payments_unavailable" | "request_failed";
  message: string;
};

const defaultApiUrl = "http://localhost:4101";

const readFailure = async (response: Response): Promise<CheckoutFailure> => {
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown };
    if (body.code === "payments_unavailable") {
      return {
        code: "payments_unavailable",
        message: "The payment service is temporarily unavailable.",
      };
    }
    if (body.code === "invalid_request") {
      return { code: "invalid_request", message: "The order details could not be accepted." };
    }
  } catch {
    // The user-facing fallback below covers non-JSON upstream responses.
  }

  return { code: "request_failed", message: "We could not place the order right now." };
};

export const createCheckout = async ({
  amountCents,
  itemCount,
  signal,
  userId,
}: {
  amountCents: number;
  itemCount: number;
  signal?: AbortSignal;
  userId: string;
}): Promise<CheckoutResult> => {
  const apiUrl = (import.meta.env.VITE_CHECKOUT_API_URL || defaultApiUrl).replace(/\/$/u, "");
  const response = await fetch(`${apiUrl}/v1/checkout`, {
    body: JSON.stringify({ amountCents, itemCount, requestId: crypto.randomUUID(), userId }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    throw await readFailure(response);
  }

  return (await response.json()) as CheckoutResult;
};
