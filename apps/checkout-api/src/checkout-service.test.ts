import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Metric, Option, Redacted } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { CheckoutService } from "./checkout-service.js";
import { CheckoutConfig } from "./config.js";
import { PaymentAuthorizationResponse } from "./contracts.js";
import { PaymentUnavailable } from "./errors.js";
import { checkoutDuration, serverRequests, upstreamDuration, upstreamRequests } from "./metrics.js";
import { PaymentsClient } from "./payments-client.js";
import { metricUserId } from "./telemetry-cardinality.js";

const request = {
  amountCents: 16_058,
  itemCount: 1,
  requestId: "req_123",
  userId: "user_123",
};

const requestMetricAttributes = (status: "200" | "503") => ({
  retry: "false",
  route: "/v1/checkout",
  status,
  "user.id": metricUserId(request.userId),
});

const runCheckout = (payments: ReturnType<typeof PaymentsClient.of>) =>
  Effect.gen(function* () {
    const checkout = yield* CheckoutService;
    const result = yield* Effect.exit(checkout.checkout(request));
    const successRequests = yield* Metric.value(
      Metric.withAttributes(serverRequests, requestMetricAttributes("200")),
    );
    const failedRequests = yield* Metric.value(
      Metric.withAttributes(serverRequests, requestMetricAttributes("503")),
    );
    const successDuration = yield* Metric.value(
      Metric.withAttributes(checkoutDuration, requestMetricAttributes("200")),
    );
    const failedDuration = yield* Metric.value(
      Metric.withAttributes(checkoutDuration, requestMetricAttributes("503")),
    );

    return { failedDuration, failedRequests, result, successDuration, successRequests };
  }).pipe(
    Effect.provide(
      CheckoutService.layer.pipe(Layer.provide(Layer.succeed(PaymentsClient, payments))),
    ),
    Effect.provideService(Metric.MetricRegistry, new Map()),
  );

describe("CheckoutService request metrics", () => {
  it.effect("records one incoming request around multiple successful payment attempts", () => {
    const attempts: Array<number> = [];
    const payments = PaymentsClient.of({
      authorize: (input) => {
        attempts.push(input.attempt);
        return input.attempt === 2
          ? Effect.succeed(
              PaymentAuthorizationResponse.make({
                approved: true,
                authorizationId: "auth_req_123",
              }),
            )
          : Effect.fail(
              new PaymentUnavailable({
                attempt: input.attempt,
                reason: "test retry",
              }),
            );
      },
    });

    return Effect.gen(function* () {
      const measured = yield* runCheckout(payments);

      expect(attempts).toEqual([0, 1, 2]);
      expect(measured.result._tag).toBe("Success");
      expect(measured.successRequests.count).toBe(1);
      expect(measured.successDuration.count).toBe(1);
      expect(measured.failedRequests.count).toBe(0);
      expect(measured.failedDuration.count).toBe(0);
    });
  });

  it.effect("records one failed incoming request after all payment attempts fail", () => {
    const attempts: Array<number> = [];
    const payments = PaymentsClient.of({
      authorize: (input) => {
        attempts.push(input.attempt);
        return Effect.fail(
          new PaymentUnavailable({
            attempt: input.attempt,
            reason: "test outage",
          }),
        );
      },
    });

    return Effect.gen(function* () {
      const measured = yield* runCheckout(payments);

      expect(attempts).toEqual([0, 1, 2, 3]);
      expect(measured.result._tag).toBe("Failure");
      expect(measured.successRequests.count).toBe(0);
      expect(measured.successDuration.count).toBe(0);
      expect(measured.failedRequests.count).toBe(1);
      expect(measured.failedDuration.count).toBe(1);
    });
  });

  it.effect("separates one incoming request from every real upstream attempt", () => {
    let responses = 0;
    const client = HttpClient.make((httpRequest) => {
      responses += 1;
      const status = responses < 3 ? 503 : 200;
      const body =
        status === 200
          ? JSON.stringify({ approved: true, authorizationId: "auth_req_123" })
          : undefined;
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          httpRequest,
          new Response(body, {
            headers: body === undefined ? undefined : { "content-type": "application/json" },
            status,
          }),
        ),
      );
    });
    const ConfigTest = Layer.succeed(
      CheckoutConfig,
      CheckoutConfig.of({
        checkoutWebOrigin: "https://checkout.clear.test",
        deployEventsUrl: Option.none(),
        ingestKey: Option.none(),
        paymentsBaseUrl: "http://payments-stub",
        paymentsServiceToken: Redacted.make("test-token"),
        renderExternalUrl: Option.none(),
        renderGitCommit: "test",
        upstreamTimeoutMs: 1_200, // 1.2 seconds
      }),
    );
    const PaymentsLive = PaymentsClient.layer.pipe(
      Layer.provide(Layer.mergeAll(ConfigTest, Layer.succeed(HttpClient.HttpClient, client))),
    );
    const CheckoutLive = CheckoutService.layer.pipe(Layer.provide(PaymentsLive));
    const userId = metricUserId(request.userId);
    const upstreamAttributes = (attempt: string, retry: string, status: string) => ({
      attempt,
      retry,
      route: "/v1/checkout",
      status,
      target: "payments-stub",
      "user.id": userId,
    });

    return Effect.gen(function* () {
      const checkout = yield* CheckoutService;
      yield* checkout.checkout(request);
      const attempts = yield* Effect.forEach(
        [
          upstreamAttributes("1", "false", "503"),
          upstreamAttributes("2", "true", "503"),
          upstreamAttributes("3", "true", "200"),
        ],
        (attributes) =>
          Effect.all({
            duration: Metric.value(Metric.withAttributes(upstreamDuration, attributes)),
            requests: Metric.value(Metric.withAttributes(upstreamRequests, attributes)),
          }),
      );
      const incoming = yield* Metric.value(
        Metric.withAttributes(serverRequests, requestMetricAttributes("200")),
      );

      expect(responses).toBe(3);
      expect(incoming.count).toBe(1);
      expect(attempts.map(({ requests }) => requests.count)).toEqual([1, 1, 1]);
      expect(attempts.map(({ duration }) => duration.count)).toEqual([1, 1, 1]);
    }).pipe(Effect.provide(CheckoutLive), Effect.provideService(Metric.MetricRegistry, new Map()));
  });
});
