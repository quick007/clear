import { Clock, Context, Effect, Layer, Metric, Redacted } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { CheckoutConfig } from "./config.js";
import { PaymentAuthorizationRequest, PaymentAuthorizationResponse } from "./contracts.js";
import { PaymentUnavailable } from "./errors.js";
import { upstreamDuration, upstreamRequests } from "./metrics.js";
import { isSampledTelemetryId, metricUserId } from "./telemetry-cardinality.js";

const recordAttempt = (
  request: PaymentAuthorizationRequest,
  durationMs: number,
  status: string,
) => {
  const attributes = {
    attempt: String(request.attempt + 1),
    retry: String(request.attempt > 0),
    route: "/v1/checkout",
    status,
    target: "payments-stub",
    "user.id": metricUserId(request.userId),
  };

  return Effect.all(
    [
      Metric.update(Metric.withAttributes(upstreamRequests, attributes), 1),
      Metric.update(Metric.withAttributes(upstreamDuration, attributes), durationMs),
    ],
    { discard: true },
  );
};

const toFailureReason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export class PaymentsClient extends Context.Service<
  PaymentsClient,
  {
    readonly authorize: (
      request: PaymentAuthorizationRequest,
    ) => Effect.Effect<PaymentAuthorizationResponse, PaymentUnavailable>;
  }
>()("groundtruth/checkout-api/PaymentsClient") {
  static readonly layer = Layer.effect(
    PaymentsClient,
    Effect.gen(function* () {
      const config = yield* CheckoutConfig;
      const client = yield* HttpClient.HttpClient;

      const executeAuthorization = Effect.fn("payments.authorize")(function* (
        request: PaymentAuthorizationRequest,
      ) {
        const httpRequest = yield* HttpClientRequest.post(
          `${config.paymentsBaseUrl}/v1/authorize`,
        ).pipe(
          HttpClientRequest.setHeader(
            "authorization",
            `Bearer ${Redacted.value(config.paymentsServiceToken)}`,
          ),
          HttpClientRequest.schemaBodyJson(PaymentAuthorizationRequest)(request),
          Effect.mapError(
            (error) =>
              new PaymentUnavailable({
                attempt: request.attempt,
                reason: toFailureReason(error),
              }),
          ),
        );

        const response = yield* client.execute(httpRequest).pipe(
          Effect.timeoutOrElse({
            duration: config.upstreamTimeoutMs,
            orElse: () =>
              Effect.fail(
                new PaymentUnavailable({
                  attempt: request.attempt,
                  reason: "payments request timed out",
                }),
              ),
          }),
          Effect.mapError((error) =>
            error instanceof PaymentUnavailable
              ? error
              : new PaymentUnavailable({
                  attempt: request.attempt,
                  reason: toFailureReason(error),
                }),
          ),
        );

        if (response.status !== 200) {
          return yield* new PaymentUnavailable({
            attempt: request.attempt,
            reason: `payments returned ${response.status}`,
            status: response.status,
          });
        }

        return yield* response.pipe(
          HttpClientResponse.schemaBodyJson(PaymentAuthorizationResponse),
          Effect.mapError(
            (error) =>
              new PaymentUnavailable({
                attempt: request.attempt,
                reason: toFailureReason(error),
                status: response.status,
              }),
          ),
        );
      });

      return PaymentsClient.of({
        authorize: (request) =>
          Effect.gen(function* () {
            const startedAt = yield* Clock.currentTimeMillis;
            return yield* executeAuthorization(request).pipe(
              Effect.matchEffect({
                onFailure: (error) =>
                  Effect.gen(function* () {
                    const finishedAt = yield* Clock.currentTimeMillis;
                    yield* recordAttempt(
                      request,
                      finishedAt - startedAt,
                      error.status === undefined ? "unavailable" : String(error.status),
                    );
                    if (isSampledTelemetryId(request.requestId)) {
                      yield* Effect.logWarning("Payments attempt failed").pipe(
                        Effect.annotateLogs({
                          attempt: request.attempt,
                          reason: error.reason,
                          requestId: request.requestId,
                        }),
                      );
                    }
                    return yield* error;
                  }),
                onSuccess: (response) =>
                  Effect.gen(function* () {
                    const finishedAt = yield* Clock.currentTimeMillis;
                    yield* recordAttempt(request, finishedAt - startedAt, "200");
                    return response;
                  }),
              }),
            );
          }).pipe(
            Effect.withSpan("payments.attempt", {
              attributes: {
                attempt: request.attempt,
                retry: request.attempt > 0,
                "user.id": request.userId,
              },
              kind: "client",
            }),
          ),
      });
    }),
  );
}
