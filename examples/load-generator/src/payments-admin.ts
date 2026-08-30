import { Context, Effect, Layer, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { GeneratorConfig } from "./config.js";
import { FailureRateUpdate } from "./contracts.js";
import { ExampleServiceUnavailable } from "./errors.js";

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class PaymentsAdmin extends Context.Service<
  PaymentsAdmin,
  {
    readonly setFailureRate: (
      failureRate: number,
      seed: string,
    ) => Effect.Effect<void, ExampleServiceUnavailable>;
  }
>()("groundtruth/load-generator/PaymentsAdmin") {
  static readonly layer = Layer.effect(
    PaymentsAdmin,
    Effect.gen(function* () {
      const config = yield* GeneratorConfig;
      const client = yield* HttpClient.HttpClient;

      return PaymentsAdmin.of({
        setFailureRate: (failureRate, seed) =>
          Effect.gen(function* () {
            const request = yield* HttpClientRequest.put(
              `${config.paymentsBaseUrl}/v1/admin/failure-rate`,
            ).pipe(
              HttpClientRequest.bearerToken(Redacted.value(config.paymentsControlToken)),
              HttpClientRequest.schemaBodyJson(FailureRateUpdate)({
                failureRate,
                seed,
              }),
              Effect.mapError(
                (error) =>
                  new ExampleServiceUnavailable({
                    reason: reason(error),
                    service: "payments-stub",
                  }),
              ),
            );
            const response = yield* client.execute(request).pipe(
              Effect.mapError(
                (error) =>
                  new ExampleServiceUnavailable({
                    reason: reason(error),
                    service: "payments-stub",
                  }),
              ),
            );

            if (response.status < 200 || response.status >= 300) {
              return yield* new ExampleServiceUnavailable({
                reason: `payments control returned ${response.status}`,
                service: "payments-stub",
                status: response.status,
              });
            }
          }).pipe(
            Effect.withSpan("load-generator.configure-payments", {
              attributes: { "failure.rate": failureRate },
              kind: "client",
            }),
          ),
      });
    }),
  );
}
