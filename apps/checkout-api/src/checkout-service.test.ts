import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Metric, Option, Redacted } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { CheckoutService } from "./checkout-service.js";
import { CheckoutConfig } from "./config.js";
import { PaymentAuthorizationResponse } from "./contracts.js";
import { CheckoutConflict, PaymentUnavailable } from "./errors.js";
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

describe("CheckoutService idempotency", () => {
  it.effect("coalesces concurrent requests and replays their successful response", () => {
    let authorizations = 0;

    return Effect.gen(function* () {
      const authorizationStarted = yield* Deferred.make<void>();
      const releaseAuthorization = yield* Deferred.make<void>();
      const payments = PaymentsClient.of({
        authorize: () =>
          Effect.gen(function* () {
            authorizations += 1;
            yield* Deferred.succeed(authorizationStarted, undefined);
            yield* Deferred.await(releaseAuthorization);
            return PaymentAuthorizationResponse.make({
              approved: true,
              authorizationId: "auth_once",
            });
          }),
      });

      return yield* Effect.gen(function* () {
        const checkout = yield* CheckoutService;
        const first = yield* Effect.forkChild(checkout.checkout(request));
        yield* Deferred.await(authorizationStarted);
        const duplicate = yield* Effect.forkChild(checkout.checkout(request));
        yield* Effect.yieldNow;
        const conflict = yield* Effect.flip(
          checkout.checkout({ ...request, amountCents: request.amountCents + 1 }),
        );
        expect(authorizations).toBe(1);
        expect(conflict).toBeInstanceOf(CheckoutConflict);

        yield* Deferred.succeed(releaseAuthorization, undefined);
        const [firstResponse, duplicateResponse] = yield* Effect.all([
          Fiber.join(first),
          Fiber.join(duplicate),
        ]);
        const replayed = yield* checkout.checkout(request);

        expect(firstResponse).toEqual(duplicateResponse);
        expect(replayed).toEqual(firstResponse);
        expect(authorizations).toBe(1);
      }).pipe(
        Effect.provide(
          CheckoutService.layer.pipe(Layer.provide(Layer.succeed(PaymentsClient, payments))),
        ),
        Effect.provideService(Metric.MetricRegistry, new Map()),
      );
    });
  });

  it.effect("does not cache failures and permits a later recovery", () => {
    let available = false;
    let authorizations = 0;
    const payments = PaymentsClient.of({
      authorize: (input) => {
        authorizations += 1;
        return available
          ? Effect.succeed(
              PaymentAuthorizationResponse.make({
                approved: true,
                authorizationId: "auth_recovered",
              }),
            )
          : Effect.fail(
              new PaymentUnavailable({
                attempt: input.attempt,
                reason: "test outage",
              }),
            );
      },
    });

    return Effect.gen(function* () {
      const checkout = yield* CheckoutService;
      const failed = yield* Effect.exit(checkout.checkout(request));
      available = true;
      const recovered = yield* checkout.checkout(request);

      expect(failed._tag).toBe("Failure");
      expect(recovered.authorizationId).toBe("auth_recovered");
      expect(authorizations).toBe(5);
    }).pipe(
      Effect.provide(
        CheckoutService.layer.pipe(Layer.provide(Layer.succeed(PaymentsClient, payments))),
      ),
      Effect.provideService(Metric.MetricRegistry, new Map()),
    );
  });

  it.effect("scopes an idempotency key to its user", () => {
    let authorizations = 0;
    const payments = PaymentsClient.of({
      authorize: (input) => {
        authorizations += 1;
        return Effect.succeed(
          PaymentAuthorizationResponse.make({
            approved: true,
            authorizationId: `auth_${input.userId}`,
          }),
        );
      },
    });

    return Effect.gen(function* () {
      const checkout = yield* CheckoutService;
      const first = yield* checkout.checkout(request);
      const second = yield* checkout.checkout({ ...request, userId: "user_456" });

      expect(first.authorizationId).toBe("auth_user_123");
      expect(second.authorizationId).toBe("auth_user_456");
      expect(authorizations).toBe(2);
    }).pipe(
      Effect.provide(
        CheckoutService.layer.pipe(Layer.provide(Layer.succeed(PaymentsClient, payments))),
      ),
      Effect.provideService(Metric.MetricRegistry, new Map()),
    );
  });

  it.effect("rejects changed payment semantics for the same request id", () => {
    let authorizations = 0;
    const payments = PaymentsClient.of({
      authorize: (input) => {
        authorizations += 1;
        return Effect.succeed(
          PaymentAuthorizationResponse.make({
            approved: true,
            authorizationId: `auth_${input.amountCents}`,
          }),
        );
      },
    });

    return Effect.gen(function* () {
      const checkout = yield* CheckoutService;
      const first = yield* checkout.checkout(request);
      const changedAmount = yield* Effect.flip(
        checkout.checkout({ ...request, amountCents: 12_500 }),
      );
      const changedItems = yield* Effect.flip(checkout.checkout({ ...request, itemCount: 2 }));

      expect(first.authorizationId).toBe("auth_16058");
      expect(changedAmount).toBeInstanceOf(CheckoutConflict);
      expect(changedItems).toBeInstanceOf(CheckoutConflict);
      expect(authorizations).toBe(1);
    }).pipe(
      Effect.provide(
        CheckoutService.layer.pipe(Layer.provide(Layer.succeed(PaymentsClient, payments))),
      ),
      Effect.provideService(Metric.MetricRegistry, new Map()),
    );
  });

  it.effect("bounds successful replay entries", () => {
    let authorizations = 0;
    const payments = PaymentsClient.of({
      authorize: (input) => {
        authorizations += 1;
        return Effect.succeed(
          PaymentAuthorizationResponse.make({
            approved: true,
            authorizationId: `auth_${input.requestId}`,
          }),
        );
      },
    });

    return Effect.gen(function* () {
      const checkout = yield* CheckoutService;
      yield* checkout.checkout(request);
      yield* Effect.forEach(
        Array.from({ length: 256 }, (_, index) => index),
        (index) => checkout.checkout({ ...request, requestId: `req_cache_${index}` }),
        { discard: true },
      );
      yield* checkout.checkout(request);

      expect(authorizations).toBe(258);
    }).pipe(
      Effect.provide(
        CheckoutService.layer.pipe(Layer.provide(Layer.succeed(PaymentsClient, payments))),
      ),
      Effect.provideService(Metric.MetricRegistry, new Map()),
    );
  });
});
