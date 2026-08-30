import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Redacted } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { BackendConfig } from "../src/config/BackendConfig.js";
import { SecurityRoutes, sessionCookieName } from "../src/http/SecurityRoutes.js";

const consoleOrigin = "https://clear.test";

const configTest = (publicRequestsPerMinute = 300) =>
  Layer.succeed(
    BackendConfig,
    BackendConfig.of({
      environment: "test",
      port: 3000,
      publicUrl: "https://api.clear.test",
      consoleOrigin,
      developmentConsoleOrigin: undefined,
      collectorSecret: Redacted.make("collector-secret"),
      siteHandoffSecret: Redacted.make("handoff-secret"),
      sessionSecret: Redacted.make("session-secret"),
      cookieSecure: true,
      bootstrapProjectSlug: "test",
      bootstrapProjectName: "Test project",
      bootstrapIngestKey: undefined,
      sandboxSessionLimit: 100,
      sandboxCreationsPerMinute: 10,
      authenticatedRequestsPerMinute: 300,
      publicRequestsPerMinute,
    }),
  );

const testRoutes = (publicRequestsPerMinute = 300) =>
  Layer.mergeAll(
    HttpRouter.add("GET", "/probe", HttpServerResponse.text("ok")),
    HttpRouter.add("POST", "/probe", HttpServerResponse.text("ok")),
    HttpRouter.add(
      "POST",
      "/v1/sandbox/session",
      HttpServerResponse.text("created", { status: 201 }),
    ),
    SecurityRoutes.pipe(Layer.provide(configTest(publicRequestsPerMinute))),
  );

const withHandler = <Value>(
  use: (handler: (request: Request) => Promise<Response>) => Effect.Effect<Value>,
  publicRequestsPerMinute = 300,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(testRoutes(publicRequestsPerMinute), { disableLogger: true }),
    ),
    ({ handler }) => use(handler),
    ({ dispose }) => Effect.promise(dispose),
  );

describe("SecurityRoutes", () => {
  it.effect("allows standard distributed-tracing headers in browser preflights", () =>
    withHandler((handler) =>
      Effect.gen(function* () {
        const response = yield* Effect.promise(() =>
          handler(
            new Request("https://api.clear.test/probe", {
              method: "OPTIONS",
              headers: {
                origin: consoleOrigin,
                "access-control-request-method": "POST",
                "access-control-request-headers": "b3, baggage, traceparent, tracestate",
              },
            }),
          ),
        );
        const allowed = response.headers.get("access-control-allow-headers")?.toLowerCase() ?? "";

        assert.strictEqual(response.status, 204);
        assert.strictEqual(response.headers.get("access-control-allow-origin"), consoleOrigin);
        for (const header of ["b3", "baggage", "traceparent", "tracestate"]) {
          assert(allowed.includes(header));
        }
      }),
    ),
  );

  it.effect("requires an allowed origin for cookie-authenticated mutations", () =>
    withHandler((handler) =>
      Effect.gen(function* () {
        const cookie = `${sessionCookieName}=opaque-session`;
        const missingOrigin = yield* Effect.promise(() =>
          handler(
            new Request("https://api.clear.test/probe", {
              method: "POST",
              headers: { cookie },
            }),
          ),
        );
        const allowedOrigin = yield* Effect.promise(() =>
          handler(
            new Request("https://api.clear.test/probe", {
              method: "POST",
              headers: { cookie, origin: consoleOrigin },
            }),
          ),
        );
        const cookieFree = yield* Effect.promise(() =>
          handler(
            new Request("https://api.clear.test/probe", {
              method: "POST",
            }),
          ),
        );

        assert.strictEqual(missingOrigin.status, 403);
        assert.strictEqual(allowedOrigin.status, 200);
        assert.strictEqual(allowedOrigin.headers.get("access-control-allow-origin"), consoleOrigin);
        assert.strictEqual(cookieFree.status, 200);
      }),
    ),
  );

  it.effect("does not let rotating invalid credentials bypass the public fuse", () =>
    withHandler(
      (handler) =>
        Effect.gen(function* () {
          const responses = yield* Effect.forEach(
            Array.from({ length: 4 }, (_, index) => index),
            (index) =>
              Effect.promise(() =>
                handler(
                  new Request("https://api.clear.test/probe", {
                    headers: {
                      authorization: `Bearer invalid-${index}`,
                      "x-groundtruth-sandbox-session": `invalid-${index}`,
                    },
                  }),
                ),
              ),
          );

          assert(responses.slice(0, 3).every(({ status }) => status === 200));
          assert.strictEqual(responses[3]?.status, 429);
          assert.strictEqual(responses[3]?.headers.get("retry-after"), "60");
        }),
      3,
    ),
  );

  it.effect("ignores spoofed forwarded client addresses", () =>
    withHandler(
      (handler) =>
        Effect.gen(function* () {
          const first = yield* Effect.promise(() =>
            handler(
              new Request("https://api.clear.test/probe", {
                headers: { "x-forwarded-for": "203.0.113.1" },
              }),
            ),
          );
          const second = yield* Effect.promise(() =>
            handler(
              new Request("https://api.clear.test/probe", {
                headers: { "x-forwarded-for": "198.51.100.200" },
              }),
            ),
          );

          assert.strictEqual(first.status, 200);
          assert.strictEqual(second.status, 429);
        }),
      1,
    ),
  );

  it.effect("globally throttles anonymous sandbox creation without trusting proxy headers", () =>
    withHandler((handler) =>
      Effect.gen(function* () {
        const responses = yield* Effect.forEach(
          Array.from({ length: 11 }, (_, index) => index),
          (index) =>
            Effect.promise(() =>
              handler(
                new Request("https://api.clear.test/v1/sandbox/session", {
                  method: "POST",
                  headers: {
                    "x-forwarded-for": `203.0.113.${index + 1}`,
                    "x-groundtruth-sandbox-session": `rotated-${index}`,
                  },
                }),
              ),
            ),
        );

        assert(responses.slice(0, 10).every(({ status }) => status === 201));
        assert.strictEqual(responses[10]?.status, 429);
        assert.strictEqual(responses[10]?.headers.get("retry-after"), "60");
        assert.deepStrictEqual(yield* Effect.promise(() => responses[10]!.json()), {
          _tag: "QuotaExceeded",
          quota: "sandbox session creations per minute",
          limit: 10,
          observed: 11,
          message: "Sandbox creation is temporarily busy. Try again in one minute.",
        });
      }),
    ),
  );
});
