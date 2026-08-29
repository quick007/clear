import { Effect, Layer } from "effect";
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { CheckoutService } from "./checkout-service.js";
import { CheckoutConfig } from "./config.js";
import { CheckoutRequest, CheckoutResponse } from "./contracts.js";
import { PaymentUnavailable } from "./errors.js";
import { RequestGuards } from "./security.js";

const health = HttpServerResponse.jsonUnsafe({
  service: "checkout-api",
  status: "ok",
});

const checkoutRoute = Effect.gen(function* () {
  const service = yield* CheckoutService;
  const request = yield* HttpServerRequest.schemaBodyJson(CheckoutRequest);
  const result = yield* service.checkout(request);
  return yield* HttpServerResponse.schemaJson(CheckoutResponse)(result, {
    status: 200,
  });
}).pipe(
  Effect.catch((error) =>
    Effect.succeed(
      error instanceof PaymentUnavailable
        ? HttpServerResponse.jsonUnsafe(
            {
              code: "payments_unavailable",
              message: "Payments is temporarily unavailable",
              requestFailedAtAttempt: error.attempt,
            },
            { status: 503 },
          )
        : HttpServerResponse.jsonUnsafe(
            { code: "invalid_request", message: "The checkout request is invalid" },
            { status: 400 },
          ),
    ),
  ),
  Effect.catchCause((cause) =>
    Effect.logError("Checkout failed unexpectedly", cause).pipe(
      Effect.as(
        HttpServerResponse.jsonUnsafe(
          { code: "internal_error", message: "Checkout could not be completed" },
          { status: 500 },
        ),
      ),
    ),
  ),
);

const CorsLive = HttpRouter.middleware(
  Effect.gen(function* () {
    const config = yield* CheckoutConfig;
    return HttpMiddleware.cors({
      allowedHeaders: ["content-type"],
      allowedMethods: ["POST", "OPTIONS"],
      allowedOrigins: (origin) => origin === config.checkoutWebOrigin,
      credentials: false,
      maxAge: 3_600, // 1 hour
    });
  }),
  { global: true },
);

export const Routes = Layer.mergeAll(
  RequestGuards,
  CorsLive,
  HttpRouter.add("GET", "/healthz", health),
  HttpRouter.add("GET", "/readyz", health),
  HttpRouter.add("POST", "/v1/checkout", checkoutRoute),
);
