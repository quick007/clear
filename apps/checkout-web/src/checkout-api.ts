import { Effect, Schema } from "effect";
import { getCheckoutConfig } from "./config";

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

const ErrorMessage = Schema.String.check(Schema.isLengthBetween(1, 1_000));

const ApiFailureResponse = Schema.Union([
  Schema.Struct({ code: Schema.Literal("invalid_request"), message: ErrorMessage }),
  Schema.Struct({ code: Schema.Literal("payments_unavailable"), message: ErrorMessage }),
  Schema.Struct({ code: Schema.Literal("request_too_large"), message: ErrorMessage }),
  Schema.Struct({ code: Schema.Literal("rate_limited"), message: ErrorMessage }),
  Schema.Struct({ code: Schema.Literal("checkout_busy"), message: ErrorMessage }),
  Schema.Struct({ code: Schema.Literal("internal_error"), message: ErrorMessage }),
]);

export class CheckoutRequestRejected extends Schema.TaggedError<CheckoutRequestRejected>()(
  "CheckoutRequestRejected",
  {},
) {}

export class PaymentUnavailable extends Schema.TaggedError<PaymentUnavailable>()(
  "PaymentUnavailable",
  { retryAfterSeconds: Schema.optionalKey(Schema.Natural) },
) {}

export class CheckoutRequestTooLarge extends Schema.TaggedError<CheckoutRequestTooLarge>()(
  "CheckoutRequestTooLarge",
  {},
) {}

export class CheckoutRateLimited extends Schema.TaggedError<CheckoutRateLimited>()(
  "CheckoutRateLimited",
  { retryAfterSeconds: Schema.optionalKey(Schema.Natural) },
) {}

export class CheckoutBusy extends Schema.TaggedError<CheckoutBusy>()("CheckoutBusy", {
  retryAfterSeconds: Schema.optionalKey(Schema.Natural),
}) {}

export class CheckoutServerFailure extends Schema.TaggedError<CheckoutServerFailure>()(
  "CheckoutServerFailure",
  {},
) {}

export class CheckoutTransportFailure extends Schema.TaggedError<CheckoutTransportFailure>()(
  "CheckoutTransportFailure",
  {},
) {}

export class CheckoutProtocolFailure extends Schema.TaggedError<CheckoutProtocolFailure>()(
  "CheckoutProtocolFailure",
  {},
) {}

export class CheckoutClientFailure extends Schema.TaggedError<CheckoutClientFailure>()(
  "CheckoutClientFailure",
  {},
) {}

export class CheckoutCancelled extends Schema.TaggedError<CheckoutCancelled>()(
  "CheckoutCancelled",
  {},
) {}

export const CheckoutFailure = Schema.Union([
  CheckoutBusy,
  CheckoutCancelled,
  CheckoutClientFailure,
  CheckoutProtocolFailure,
  CheckoutRateLimited,
  CheckoutRequestRejected,
  CheckoutRequestTooLarge,
  CheckoutServerFailure,
  CheckoutTransportFailure,
  PaymentUnavailable,
]).pipe(Schema.toTaggedUnion("_tag"));
export type CheckoutFailure = typeof CheckoutFailure.Type;

const isAbortError = (cause: unknown) =>
  cause instanceof Error && (cause.name === "AbortError" || cause.name === "TimeoutError");

const retryAfterSeconds = (response: Response) => {
  const value = response.headers.get("retry-after");
  if (value === null) return undefined;

  const seconds = Number(value);
  if (Number.isSafeInteger(seconds) && seconds >= 0) return seconds;

  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? undefined : Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000)); // 1 second
};

const readJson = (response: Response) =>
  Effect.tryPromise({
    try: () => response.json(),
    catch: () => new CheckoutProtocolFailure(),
  });

const decodeSuccess = (response: Response) =>
  readJson(response).pipe(
    Effect.flatMap((body) =>
      Schema.decodeUnknownEffect(CheckoutResult)(body).pipe(
        Effect.mapError(() => new CheckoutProtocolFailure()),
      ),
    ),
  );

const toFailure = (response: Response, body: typeof ApiFailureResponse.Type): CheckoutFailure => {
  const retryAfter = retryAfterSeconds(response);

  switch (body.code) {
    case "invalid_request":
      return new CheckoutRequestRejected();
    case "payments_unavailable":
      return retryAfter === undefined
        ? new PaymentUnavailable({})
        : new PaymentUnavailable({ retryAfterSeconds: retryAfter });
    case "request_too_large":
      return new CheckoutRequestTooLarge();
    case "rate_limited":
      return retryAfter === undefined
        ? new CheckoutRateLimited({})
        : new CheckoutRateLimited({ retryAfterSeconds: retryAfter });
    case "checkout_busy":
      return retryAfter === undefined
        ? new CheckoutBusy({})
        : new CheckoutBusy({ retryAfterSeconds: retryAfter });
    case "internal_error":
      return new CheckoutServerFailure();
  }
};

const decodeFailure = (response: Response) =>
  readJson(response).pipe(
    Effect.flatMap((body) =>
      Schema.decodeUnknownEffect(ApiFailureResponse)(body).pipe(
        Effect.mapError(() => new CheckoutProtocolFailure()),
      ),
    ),
    Effect.map((body) => toFailure(response, body)),
    Effect.flatMap(Effect.fail),
  );

export const checkoutFailurePresentation = (failure: CheckoutFailure) => {
  switch (failure._tag) {
    case "CheckoutRequestRejected":
      return {
        actionLabel: "Reload checkout",
        detail: "Reload checkout to start this order again.",
        recovery: "reload",
        title: "We could not accept this order",
      } as const;
    case "PaymentUnavailable":
      return {
        actionLabel: "Try again",
        detail: "The payment service is temporarily unavailable.",
        recovery: "retry",
        title: "Order not placed",
      } as const;
    case "CheckoutRequestTooLarge":
      return {
        actionLabel: "Reload checkout",
        detail: "Reload checkout to start with a smaller order.",
        recovery: "reload",
        title: "This order is too large",
      } as const;
    case "CheckoutRateLimited":
      return {
        actionLabel: "Try again",
        detail: "Please wait a moment before placing this order again.",
        recovery: "retry",
        title: "Please wait before trying again",
      } as const;
    case "CheckoutBusy":
      return {
        actionLabel: "Try again",
        detail: "Checkout is temporarily at capacity.",
        recovery: "retry",
        title: "Order not placed",
      } as const;
    case "CheckoutServerFailure":
      return {
        actionLabel: "Try again",
        detail: "Please try again in a moment.",
        recovery: "retry",
        title: "Checkout is unavailable",
      } as const;
    case "CheckoutTransportFailure":
      return {
        actionLabel: "Try again",
        detail: "Check your connection, then try again.",
        recovery: "retry",
        title: "We could not reach checkout",
      } as const;
    case "CheckoutProtocolFailure":
      return {
        actionLabel: "Try again",
        detail: "Checkout returned an incomplete response. Try again to confirm the order.",
        recovery: "retry",
        title: "We could not confirm this order",
      } as const;
    case "CheckoutClientFailure":
      return {
        actionLabel: "Reload checkout",
        detail: "Reload the page to load checkout again.",
        recovery: "reload",
        title: "Checkout is not ready",
      } as const;
    case "CheckoutCancelled":
      return {
        actionLabel: "",
        detail: "",
        recovery: "none",
        title: "",
      } as const;
  }
};

export const checkoutRetryAfterSeconds = (failure: CheckoutFailure) => {
  switch (failure._tag) {
    case "PaymentUnavailable":
    case "CheckoutRateLimited":
    case "CheckoutBusy":
      return failure.retryAfterSeconds;
    default:
      return undefined;
  }
};

export const createCheckout = ({
  amountCents,
  itemCount,
  requestId,
  signal,
  userId,
}: {
  amountCents: number;
  itemCount: number;
  requestId: string;
  signal?: AbortSignal;
  userId: string;
}) =>
  Effect.gen(function* () {
    const { apiOrigin } = yield* Effect.try({
      try: getCheckoutConfig,
      catch: () => new CheckoutClientFailure(),
    });
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${apiOrigin}/v1/checkout`, {
          body: JSON.stringify({ amountCents, itemCount, requestId, userId }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal,
        }),
      catch: (cause) =>
        isAbortError(cause) ? new CheckoutCancelled() : new CheckoutTransportFailure(),
    });

    if (!response.ok) {
      return yield* decodeFailure(response);
    }

    return yield* decodeSuccess(response);
  });
