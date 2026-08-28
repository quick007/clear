import { Context, Effect, Layer, Redacted } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { timingSafeEqual } from "node:crypto";
import { PaymentsConfig } from "./config.js";
import { AuthenticationFailed } from "./errors.js";

const bearerValue = (authorization: string | undefined) =>
  authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;

const matches = (actual: string | undefined, expected: Redacted.Redacted) => {
  if (actual === undefined) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(Redacted.value(expected));
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
};

export class RequestAuth extends Context.Service<
  RequestAuth,
  {
    readonly control: Effect.Effect<
      void,
      AuthenticationFailed,
      HttpServerRequest.HttpServerRequest
    >;
    readonly service: Effect.Effect<
      void,
      AuthenticationFailed,
      HttpServerRequest.HttpServerRequest
    >;
  }
>()("groundtruth/payments-stub/RequestAuth") {
  static readonly layer = Layer.effect(
    RequestAuth,
    Effect.gen(function* () {
      const config = yield* PaymentsConfig;

      const authorize = (expected: Redacted.Redacted, scope: "control" | "service") =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          if (!matches(bearerValue(request.headers.authorization), expected)) {
            return yield* new AuthenticationFailed({ scope });
          }
        });

      return RequestAuth.of({
        control: authorize(config.controlToken, "control"),
        service: authorize(config.serviceToken, "service"),
      });
    }),
  );
}
