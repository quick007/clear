import { Clock, Context, Effect, Layer, Metric } from "effect";
import { CheckoutRequest, CheckoutResponse } from "./contracts.js";
import { PaymentUnavailable } from "./errors.js";
import { retryImmediately } from "./lib/retry.js";
import { checkoutDuration, replicas } from "./metrics.js";
import { PaymentsClient } from "./payments-client.js";

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

        const authorization = yield* retryImmediately((attempt) =>
          payments.authorize({
            amountCents: request.amountCents,
            attempt,
            requestId: request.requestId,
            userId: request.userId,
          }),
        );

        const finishedAt = yield* Clock.currentTimeMillis;
        yield* Metric.update(
          Metric.withAttributes(checkoutDuration, {
            route: "/v1/checkout",
            status: "200",
          }),
          finishedAt - startedAt,
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

      return CheckoutService.of({ checkout });
    }),
  );
}
