import { Clock, Context, Effect, Layer, Metric } from "effect";
import { CheckoutRequest, CheckoutResponse } from "./contracts.js";
import { PaymentUnavailable } from "./errors.js";
import { retryImmediately } from "./lib/retry.js";
import { checkoutDuration, replicas, serverRequests } from "./metrics.js";
import { PaymentsClient } from "./payments-client.js";
import { metricUserId } from "./telemetry-cardinality.js";

const recordRequest = (request: CheckoutRequest, durationMs: number, status: "200" | "503") => {
  const attributes = {
    retry: "false",
    route: "/v1/checkout",
    status,
    "user.id": metricUserId(request.userId),
  };

  return Effect.all(
    [
      Metric.update(Metric.withAttributes(serverRequests, attributes), 1),
      Metric.update(Metric.withAttributes(checkoutDuration, attributes), durationMs),
    ],
    { discard: true },
  );
};

export class CheckoutService extends Context.Service<
  CheckoutService,
  {
    readonly checkout: (
      request: CheckoutRequest,
    ) => Effect.Effect<CheckoutResponse, PaymentUnavailable>;
  }
>()("groundtruth/checkout-api/CheckoutService") {
  static readonly layer = Layer.effect(
    CheckoutService,
    Effect.gen(function* () {
      const payments = yield* PaymentsClient;
      yield* Metric.update(replicas, 1);

      const checkout = Effect.fn("checkout.process")(function* (request: CheckoutRequest) {
        const startedAt = yield* Clock.currentTimeMillis;
        yield* Effect.annotateCurrentSpan({
          "checkout.item_count": request.itemCount,
          "checkout.request_id": request.requestId,
          "user.id": request.userId,
        });

        const process = Effect.gen(function* () {
          const authorization = yield* retryImmediately((attempt) =>
            payments.authorize({
              amountCents: request.amountCents,
              attempt,
              requestId: request.requestId,
              userId: request.userId,
            }),
          );

          yield* Effect.logInfo("Checkout confirmed").pipe(
            Effect.annotateLogs({
              requestId: request.requestId,
              userId: request.userId,
            }),
          );

          return CheckoutResponse.make({
            authorizationId: authorization.authorizationId,
            requestId: request.requestId,
            status: "confirmed",
          });
        });

        return yield* process.pipe(
          Effect.matchEffect({
            onFailure: (error) =>
              Effect.gen(function* () {
                const finishedAt = yield* Clock.currentTimeMillis;
                yield* recordRequest(request, finishedAt - startedAt, "503");
                return yield* error;
              }),
            onSuccess: (response) =>
              Effect.gen(function* () {
                const finishedAt = yield* Clock.currentTimeMillis;
                yield* recordRequest(request, finishedAt - startedAt, "200");
                return response;
              }),
          }),
        );
      });

      return CheckoutService.of({ checkout });
    }),
  );
}
