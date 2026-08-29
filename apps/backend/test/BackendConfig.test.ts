import { assert, describe, it } from "@effect/vitest";
import { Cause, ConfigProvider, Effect, Exit } from "effect";
import { BackendConfig } from "../src/config/BackendConfig.js";

const loadConfig = (values: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    return yield* BackendConfig;
  }).pipe(
    Effect.provide(BackendConfig.layer),
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(values)),
  );

describe("BackendConfig", () => {
  it.effect("uses strict hosted request defaults", () =>
    Effect.gen(function* () {
      const config = yield* loadConfig({});
      assert.strictEqual(config.sandboxSessionLimit, 25);
      assert.strictEqual(config.sandboxCreationsPerMinute, 5);
      assert.strictEqual(config.authenticatedRequestsPerMinute, 120);
      assert.strictEqual(config.publicRequestsPerMinute, 1_200);
    }),
  );

  it.effect("rejects a weak configured admin token during startup", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(loadConfig({ GROUNDTRUTH_ADMIN_TOKEN: "too-short" }));
      assert(Exit.isFailure(exit));
      assert(
        exit.cause.reasons.some(
          (reason) =>
            Cause.isDieReason(reason) &&
            reason.defect instanceof Error &&
            reason.defect.message === "GROUNDTRUTH_ADMIN_TOKEN must contain at least 32 characters",
        ),
      );
    }),
  );

  it.effect("loads the sandbox capacity override", () =>
    Effect.gen(function* () {
      const config = yield* loadConfig({
        GROUNDTRUTH_SANDBOX_SESSION_LIMIT: "37",
        GROUNDTRUTH_SANDBOX_CREATIONS_PER_MINUTE: "7",
      });
      assert.strictEqual(config.sandboxSessionLimit, 37);
      assert.strictEqual(config.sandboxCreationsPerMinute, 7);
    }),
  );

  it.effect("loads authenticated and public request limit overrides", () =>
    Effect.gen(function* () {
      const config = yield* loadConfig({
        GROUNDTRUTH_AUTHENTICATED_REQUESTS_PER_MINUTE: "250",
        GROUNDTRUTH_PUBLIC_REQUESTS_PER_MINUTE: "9000",
      });
      assert.strictEqual(config.authenticatedRequestsPerMinute, 250);
      assert.strictEqual(config.publicRequestsPerMinute, 9000);
    }),
  );

  it.effect("keeps the public fuse above the authenticated session limit", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        loadConfig({
          GROUNDTRUTH_AUTHENTICATED_REQUESTS_PER_MINUTE: "301",
          GROUNDTRUTH_PUBLIC_REQUESTS_PER_MINUTE: "300",
        }),
      );
      assert(Exit.isFailure(exit));
      assert(
        exit.cause.reasons.some(
          (reason) =>
            Cause.isDieReason(reason) &&
            reason.defect instanceof Error &&
            reason.defect.message ===
              "GROUNDTRUTH_PUBLIC_REQUESTS_PER_MINUTE must be at least GROUNDTRUTH_AUTHENTICATED_REQUESTS_PER_MINUTE",
        ),
      );
    }),
  );

  it.effect("rejects a non-positive sandbox capacity", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(loadConfig({ GROUNDTRUTH_SANDBOX_SESSION_LIMIT: "0" }));
      assert(Exit.isFailure(exit));
      assert(
        exit.cause.reasons.some(
          (reason) =>
            Cause.isDieReason(reason) &&
            reason.defect instanceof Error &&
            reason.defect.message === "GROUNDTRUTH_SANDBOX_SESSION_LIMIT must be at least 1",
        ),
      );
    }),
  );
});
