import { Clock, Context, Effect, Layer, Metric } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { GeneratorConfig } from "./config.js";
import { CheckoutRequest } from "./contracts.js";
import { ExampleServiceUnavailable } from "./errors.js";
import { generatedDuration, generatedRequests } from "./metrics.js";

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class CheckoutClient extends Context.Service<
  CheckoutClient,
  {
    readonly send: (request: CheckoutRequest) => Effect.Effect<void, ExampleServiceUnavailable>;
  }
>()("groundtruth/load-generator/CheckoutClient") {
  static readonly layer = Layer.effect(
    CheckoutClient,
    Effect.gen(function* () {
      const config = yield* GeneratorConfig;
      const client = yield* HttpClient.HttpClient;

      const execute = Effect.fn("load-generator.checkout")(function* (input: CheckoutRequest) {
        const request = yield* HttpClientRequest.post(`${config.checkoutBaseUrl}/v1/checkout`).pipe(
          HttpClientRequest.schemaBodyJson(CheckoutRequest)(input),
          Effect.mapError(
            (error) =>
              new ExampleServiceUnavailable({
                reason: reason(error),
                service: "checkout-api",
              }),
          ),
        );
        const response = yield* client.execute(request).pipe(
          Effect.mapError(
            (error) =>
              new ExampleServiceUnavailable({
                reason: reason(error),
                service: "checkout-api",
              }),
          ),
        );

        if (response.status < 200 || response.status >= 300) {
          return yield* new ExampleServiceUnavailable({
            reason: `checkout-api returned ${response.status}`,
            service: "checkout-api",
            status: response.status,
          });
        }
      });

      return CheckoutClient.of({
        send: (request) =>
          Effect.gen(function* () {
            const startedAt = yield* Clock.currentTimeMillis;
            return yield* execute(request).pipe(
              Effect.matchEffect({
                onFailure: (error) =>
                  Effect.gen(function* () {
                    const finishedAt = yield* Clock.currentTimeMillis;
                    yield* record(
                      request,
                      finishedAt - startedAt,
                      String(error.status ?? "unavailable"),
                    );
                    return yield* error;
                  }),
                onSuccess: () =>
                  Effect.gen(function* () {
                    const finishedAt = yield* Clock.currentTimeMillis;
                    yield* record(request, finishedAt - startedAt, "200");
                  }),
              }),
            );
          }).pipe(
            Effect.withSpan("load-generator.checkout", {
              attributes: {
                "checkout.request_id": request.requestId,
                "user.id": request.userId,
              },
              kind: "producer",
            }),
          ),
      });
    }),
  );
}

const record = (request: CheckoutRequest, durationMs: number, status: string) => {
  const attributes = {
    route: "/v1/checkout",
    status,
    "user.id": request.userId,
  };
  return Effect.all(
    [
      Metric.update(Metric.withAttributes(generatedRequests, attributes), 1),
      Metric.update(Metric.withAttributes(generatedDuration, attributes), durationMs),
    ],
    { discard: true },
  );
};
