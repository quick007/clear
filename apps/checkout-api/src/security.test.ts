import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { makeRequestGuards } from "./security.js";

const checkoutUrl = "https://checkout-api.clear.seufert.sh/v1/checkout";

const withHandler = <Value>(
  routes: Layer.Layer<never, never, HttpRouter.HttpRouter>,
  use: (handler: (request: Request) => Promise<Response>) => Effect.Effect<Value>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => HttpRouter.toWebHandler(routes, { disableLogger: true })),
    ({ handler }) => use(handler),
    ({ dispose }) => Effect.promise(dispose),
  );

describe("checkout request guards", () => {
  it.effect("rejects declared bodies above the configured limit", () => {
    const routes = Layer.mergeAll(
      HttpRouter.add("POST", "/v1/checkout", HttpServerResponse.text("ok")),
      makeRequestGuards({ maxBodyBytes: 32 }),
    );

    return withHandler(routes, (handler) =>
      Effect.gen(function* () {
        const body = JSON.stringify({ payload: "x".repeat(64) });
        const response = yield* Effect.promise(() =>
          handler(
            new Request(checkoutUrl, {
              body,
              headers: { "content-length": String(body.length) },
              method: "POST",
            }),
          ),
        );

        assert.strictEqual(response.status, 413);
        assert.strictEqual(
          (yield* Effect.promise(() => response.json())).code,
          "request_too_large",
        );
      }),
    );
  });

  it.effect("rate limits checkout without affecting health checks", () => {
    const routes = Layer.mergeAll(
      HttpRouter.add("POST", "/v1/checkout", HttpServerResponse.text("ok")),
      HttpRouter.add("GET", "/healthz", HttpServerResponse.text("ok")),
      makeRequestGuards({ requestsPerWindow: 2 }),
    );

    return withHandler(routes, (handler) =>
      Effect.gen(function* () {
        const responses = yield* Effect.forEach([0, 1, 2], () =>
          Effect.promise(() => handler(new Request(checkoutUrl, { method: "POST" }))),
        );
        const health = yield* Effect.promise(() =>
          handler(new Request("https://checkout-api.clear.seufert.sh/healthz")),
        );

        assert.deepStrictEqual(
          responses.map(({ status }) => status),
          [200, 200, 429],
        );
        assert.strictEqual(responses[2]?.headers.get("retry-after"), "60");
        assert.strictEqual(health.status, 200);
      }),
    );
  });

  it.effect("sheds checkout work when all concurrency permits are occupied", () => {
    let enterRoute = () => {};
    let releaseRoute = () => {};
    const entered = new Promise<void>((resolve) => {
      enterRoute = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseRoute = resolve;
    });
    const slowResponse = Effect.promise(() => {
      enterRoute();
      return released;
    }).pipe(Effect.as(HttpServerResponse.text("ok")));
    const routes = Layer.mergeAll(
      HttpRouter.add("POST", "/v1/checkout", slowResponse),
      makeRequestGuards({ maxConcurrentCheckouts: 1 }),
    );

    return withHandler(routes, (handler) =>
      Effect.gen(function* () {
        const first = handler(new Request(checkoutUrl, { method: "POST" }));
        yield* Effect.promise(() => entered);
        const second = yield* Effect.promise(() =>
          handler(new Request(checkoutUrl, { method: "POST" })),
        );
        releaseRoute();
        const firstResponse = yield* Effect.promise(() => first);

        assert.strictEqual(firstResponse.status, 200);
        assert.strictEqual(second.status, 503);
        assert.strictEqual(second.headers.get("retry-after"), "1");
      }),
    );
  });
});
