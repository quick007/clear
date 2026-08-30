import { Option, Schema } from "effect";

const Identifier = Schema.String.check(
  Schema.isLengthBetween(1, 160),
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
);

const CheckoutResult = Schema.Struct({
  authorizationId: Identifier,
  requestId: Identifier,
  status: Schema.Literal("confirmed"),
});

export type CheckoutResult = typeof CheckoutResult.Type;

const CheckoutErrorResponse = Schema.Struct({
  code: Schema.Literals(["invalid_request", "payments_unavailable"]),
  message: Schema.String,
});

export type CheckoutFailure = {
  code: "invalid_request" | "payments_unavailable" | "request_failed";
  message: string;
};

const defaultApiUrl = "http://localhost:4101";

const requestFailed = (): CheckoutFailure => ({
  code: "request_failed",
  message: "We could not place the order right now.",
});

const readFailure = async (response: Response): Promise<CheckoutFailure> => {
  try {
    const body = Schema.decodeUnknownOption(CheckoutErrorResponse)(await response.json());
    if (Option.isSome(body) && body.value.code === "payments_unavailable") {
      return {
        code: "payments_unavailable",
        message: "The payment service is temporarily unavailable.",
      };
    }
    if (Option.isSome(body) && body.value.code === "invalid_request") {
      return { code: "invalid_request", message: "The order details could not be accepted." };
    }
  } catch {
    // The user-facing fallback below covers non-JSON responses.
  }

  return requestFailed();
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

  try {
    const body = Schema.decodeUnknownOption(CheckoutResult)(await response.json());
    if (Option.isSome(body)) {
      return body.value;
    }
  } catch {
    // The user-facing fallback below covers non-JSON responses.
  }

  throw requestFailed();
};
