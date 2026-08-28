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
  Effect.catchTag("PaymentUnavailable", (error: PaymentUnavailable) =>
    Effect.succeed(
      HttpServerResponse.jsonUnsafe(
        {
          code: "payments_unavailable",
          message: "Payments is temporarily unavailable",
          requestFailedAtAttempt: error.attempt,
        },
        { status: 503 },
      ),
    ),
  ),
  Effect.catchCause(() =>
    Effect.succeed(
      HttpServerResponse.jsonUnsafe(
        { code: "invalid_request", message: "The checkout request is invalid" },
        { status: 400 },
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
      allowedOrigins: [config.checkoutWebOrigin],
      credentials: false,
      maxAge: 3_600, // 1 hour
    });
  }),
  { global: true },
);

export const Routes = Layer.mergeAll(
  CorsLive,
  HttpRouter.add("GET", "/healthz", health),
  HttpRouter.add("GET", "/readyz", health),
  HttpRouter.add("POST", "/v1/checkout", checkoutRoute),
);
