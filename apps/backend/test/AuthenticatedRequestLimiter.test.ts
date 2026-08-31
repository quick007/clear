import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { QuotaExceeded, SessionId } from "@groundtruth/domain";
import { Effect, Layer, Redacted } from "effect";
import { TestClock } from "effect/testing";
import { BackendConfig } from "../src/config/BackendConfig.js";
import { makeAuthenticatedRequestLimiter } from "../src/http/AuthenticatedRequestLimiter.js";

const ConfigTest = Layer.succeed(
  BackendConfig,
  BackendConfig.of({
    environment: "test",
    port: 3000,
    publicUrl: "http://localhost:3000",
    consoleOrigin: "http://localhost:5173",
    developmentConsoleOrigin: undefined,
    collectorSecret: Redacted.make("collector-secret"),
    siteHandoffSecret: Redacted.make("sites-secret"),
    sessionSecret: Redacted.make("session-secret"),
    cookieSecure: false,
    bootstrapProjectSlug: "local",
    bootstrapProjectName: "Local project",
    bootstrapIngestKey: undefined,
    publicStatusEnabled: false,
    sandboxSessionLimit: 100,
    sandboxCreationsPerMinute: 10,
    authenticatedRequestsPerMinute: 2,
    publicRequestsPerMinute: 10_000,
  }),
);

describe("authenticated request limiter", () => {
  it.effect("keeps validated session quotas independent", () =>
    Effect.gen(function* () {
      const limiter = yield* makeAuthenticatedRequestLimiter();
      const sessionA = SessionId.make("01993f71-0001-7000-8000-000000000081");
      const sessionB = SessionId.make("01993f71-0001-7000-8000-000000000082");

      yield* limiter.consume(String(sessionA));
      yield* limiter.consume(String(sessionA));
      yield* limiter.consume(String(sessionB));

      const error = yield* Effect.flip(limiter.consume(String(sessionA)));
      assert(error instanceof QuotaExceeded);
      assert.strictEqual(error.quota, "authenticated requests per minute");
      assert.strictEqual(error.limit, 2);
      assert.strictEqual(error.observed, 3);

      yield* limiter.consume(String(sessionB));
    }).pipe(Effect.provide([ConfigTest, NodeCrypto.layer])),
  );

  it.effect("prunes an identity after its fixed window expires", () =>
    Effect.gen(function* () {
      const limiter = yield* makeAuthenticatedRequestLimiter();
      yield* limiter.consume("validated-session");
      yield* limiter.consume("validated-session");
      assert((yield* Effect.flip(limiter.consume("validated-session"))) instanceof QuotaExceeded);

      yield* TestClock.adjust("1 minute");
      yield* limiter.consume("validated-session");
    }).pipe(Effect.provide([ConfigTest, NodeCrypto.layer])),
  );
});
