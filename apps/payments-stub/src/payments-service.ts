import { Clock, Context, Effect, Layer, Metric } from "effect";
import { createHash } from "node:crypto";
import { PaymentAuthorizationRequest, PaymentAuthorizationResponse } from "./contracts.js";
import { FailureModel, hashUnit } from "./failure-model.js";
import {
  effectiveFailureRate,
  replicas,
  requestDuration,
  requests,
  windowRequests,
} from "./metrics.js";

export type AuthorizationOutcome =
  | { readonly _tag: "Approved"; readonly value: PaymentAuthorizationResponse }
  | { readonly _tag: "Failed"; readonly effectiveFailureRate: number };

const authorizationId = (requestId: string) =>
  `auth_${createHash("sha256").update(requestId).digest("hex").slice(0, 20)}`;

export class PaymentsService extends Context.Service<
  PaymentsService,
  {
    readonly authorize: (
      request: PaymentAuthorizationRequest,
    ) => Effect.Effect<AuthorizationOutcome>;
  }
>()("groundtruth/payments-stub/PaymentsService") {
  static readonly layer = Layer.effect(
    PaymentsService,
    Effect.gen(function* () {
      const failureModel = yield* FailureModel;
      yield* Metric.update(replicas, 1);

      const authorize = Effect.fn("payments.authorize")(function* (
        request: PaymentAuthorizationRequest,
      ) {
        const startedAt = yield* Clock.currentTimeMillis;
        const decision = yield* failureModel.decide(request);
        yield* Effect.annotateCurrentSpan({
          "failure.effective_rate": decision.effectiveFailureRate,
          "payment.attempt": request.attempt,
          "payment.request_id": request.requestId,
          "user.id": request.userId,
        });
        yield* Effect.sleep(decision.latencyMs);
        const finishedAt = yield* Clock.currentTimeMillis;
        const status = decision.failed ? "503" : "200";
        const attributes = {
          attempt: String(request.attempt),
          retry: String(request.attempt > 0),
          route: "/v1/authorize",
          status,
          "user.id": request.userId,
        };

        yield* Effect.all(
          [
            Metric.update(Metric.withAttributes(requests, attributes), 1),
            Metric.update(
              Metric.withAttributes(requestDuration, attributes),
              finishedAt - startedAt,
            ),
            Metric.update(effectiveFailureRate, decision.effectiveFailureRate),
            Metric.update(windowRequests, decision.requestsInWindow),
          ],
          { discard: true },
        );

        if (decision.failed && hashUnit(request.requestId) < 1 / 50) {
          yield* Effect.logWarning("Payment authorization failed").pipe(
            Effect.annotateLogs({
              attempt: request.attempt,
              effectiveFailureRate: decision.effectiveFailureRate,
              requestId: request.requestId,
              userId: request.userId,
            }),
          );
          return {
            _tag: "Failed" as const,
            effectiveFailureRate: decision.effectiveFailureRate,
          };
        }

        return {
          _tag: "Approved" as const,
          value: PaymentAuthorizationResponse.make({
            approved: true,
            authorizationId: authorizationId(request.requestId),
          }),
        };
      });

      return PaymentsService.of({ authorize });
    }),
  );
}
