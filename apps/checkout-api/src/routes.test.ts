import { assert, describe, it } from "@effect/vitest";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { CheckoutService } from "./checkout-service.js";
import { CheckoutConfig } from "./config.js";
import { CheckoutResponse } from "./contracts.js";
import { PaymentUnavailable } from "./errors.js";
import { Routes } from "./routes.js";

const checkoutOrigin = "https://checkout.clear.seufert.sh";
const checkoutUrl = "https://checkout-api.clear.seufert.sh/v1/checkout";
const validRequest = {
  amountCents: 16_058,
  itemCount: 1,
  requestId: "req_123",
  userId: "user_123",
};

const ConfigTest = Layer.succeed(
  CheckoutConfig,
  CheckoutConfig.of({
    checkoutWebOrigin: checkoutOrigin,
    deployEventsUrl: Option.none(),
    ingestKey: Option.none(),
    paymentsBaseUrl: "http://payments-stub",
    paymentsServiceToken: Redacted.make("test-token"),
    renderExternalUrl: Option.none(),
    renderGitCommit: "test",
    upstreamTimeoutMs: 1_200, // 1.2 seconds
  }),
);

const withHandler = <Value>(
  service: ReturnType<typeof CheckoutService.of>,
  use: (handler: (request: Request) => Promise<Response>) => Effect.Effect<Value>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(Routes.pipe(Layer.provide(ConfigTest)), { disableLogger: true }),
    ),
    ({ handler }) => use((request) => handler(request, Context.make(CheckoutService, service))),
    ({ dispose }) => Effect.promise(dispose),
  );

const SuccessService = CheckoutService.of({
  checkout: (request) =>
    Effect.succeed(
      CheckoutResponse.make({
        authorizationId: "auth_req_123",
        requestId: request.requestId,
        status: "confirmed",
      }),
    ),
});

describe("checkout routes", () => {
  it.effect("returns one confirmed order for a valid request", () =>
    withHandler(SuccessService, (handler) =>
      Effect.gen(function* () {
        const response = yield* Effect.promise(() =>
          handler(
            new Request(checkoutUrl, {
              body: JSON.stringify(validRequest),
              headers: { "content-type": "application/json", origin: checkoutOrigin },
              method: "POST",
            }),
          ),
        );

        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.headers.get("access-control-allow-origin"), checkoutOrigin);
        assert.deepStrictEqual(yield* Effect.promise(() => response.json()), {
          authorizationId: "auth_req_123",
          requestId: "req_123",
          status: "confirmed",
        });
      }),
    ),
  );

  it.effect("returns bounded errors for invalid input and unavailable payments", () => {
    const UnavailableService = CheckoutService.of({
      checkout: () =>
        Effect.fail(
          new PaymentUnavailable({
            attempt: 3,
            reason: "test outage",
          }),
        ),
    });

    return withHandler(SuccessService, (successHandler) =>
      withHandler(UnavailableService, (unavailableHandler) =>
        Effect.gen(function* () {
          const invalid = yield* Effect.promise(() =>
            successHandler(
              new Request(checkoutUrl, {
                body: JSON.stringify({ ...validRequest, userId: "bad user" }),
                headers: { "content-type": "application/json" },
                method: "POST",
              }),
            ),
          );
          const unavailable = yield* Effect.promise(() =>
            unavailableHandler(
              new Request(checkoutUrl, {
                body: JSON.stringify(validRequest),
                headers: { "content-type": "application/json" },
                method: "POST",
              }),
            ),
          );

          assert.strictEqual(invalid.status, 400);
          assert.strictEqual(unavailable.status, 503);
        }),
      ),
    );
  });

  it.effect("allows only the configured browser origin in CORS responses", () =>
    withHandler(SuccessService, (handler) =>
      Effect.gen(function* () {
        const preflight = (origin: string) =>
          handler(
            new Request(checkoutUrl, {
              headers: {
                "access-control-request-method": "POST",
                origin,
              },
              method: "OPTIONS",
            }),
          );
        const allowed = yield* Effect.promise(() => preflight(checkoutOrigin));
        const rejected = yield* Effect.promise(() => preflight("https://attacker.example"));

        assert.strictEqual(allowed.headers.get("access-control-allow-origin"), checkoutOrigin);
        assert.strictEqual(allowed.headers.get("access-control-allow-credentials"), null);
        assert.strictEqual(rejected.headers.get("access-control-allow-origin"), null);
      }),
    ),
  );
});
