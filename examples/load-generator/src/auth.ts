import { Context, Effect, Layer, Redacted } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { timingSafeEqual } from "node:crypto";
import { GeneratorConfig } from "./config.js";
import { AuthenticationFailed } from "./errors.js";

const matches = (authorization: string | undefined, expected: string) => {
  const actual = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
  if (actual === undefined) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
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
  }
>()("groundtruth/load-generator/RequestAuth") {
  static readonly layer = Layer.effect(
    RequestAuth,
    Effect.gen(function* () {
      const config = yield* GeneratorConfig;
      return RequestAuth.of({
        control: Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          if (!matches(request.headers.authorization, Redacted.value(config.controlToken))) {
            return yield* new AuthenticationFailed({});
          }
        }),
      });
    }),
  );
}
