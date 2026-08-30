import { assert, describe, it } from "@effect/vitest";
import { NodeCrypto } from "@effect/platform-node";
import { ServiceUnavailable } from "@groundtruth/api-contract";
import { Cause, Effect, Exit, Layer, Logger, Redacted, Ref } from "effect";
import { TestClock } from "effect/testing";
import {
  AuthPrincipal,
  AuthService,
  AuthServiceMaintenance,
  AdminLoginDisabled,
  InvalidAdminCredential,
  InvalidHandoffCode,
  SessionNotFound,
} from "../src/auth/AuthService.js";
import { BackendConfig } from "../src/config/BackendConfig.js";

const config = BackendConfig.of({
  environment: "test",
  port: 3000,
  publicUrl: "http://localhost:3000",
  consoleOrigin: "http://localhost:5173",
  developmentConsoleOrigin: undefined,
  collectorSecret: Redacted.make("collector-secret"),
  siteHandoffSecret: Redacted.make("sites-secret"),
  sessionSecret: Redacted.make("session-secret"),
  adminToken: Redacted.make("0123456789abcdef0123456789abcdef"),
  cookieSecure: false,
  bootstrapProjectSlug: "local",
  bootstrapProjectName: "Local project",
  bootstrapIngestKey: undefined,
  sandboxSessionLimit: 100,
  sandboxCreationsPerMinute: 10,
  authenticatedRequestsPerMinute: 300,
  publicRequestsPerMinute: 10_000,
});

const ConfigTest = Layer.succeed(BackendConfig, config);
const ConfigDisabled = Layer.succeed(
  BackendConfig,
  BackendConfig.of({ ...config, adminToken: undefined }),
);

const AuthTest = AuthService.layerMemory.pipe(Layer.provide([ConfigTest, NodeCrypto.layer]));

describe("AuthService", () => {
  it.effect("redeems a handoff exactly once and revokes the session", () =>
    Effect.gen(function* () {
      const auth = yield* AuthService;
      const handoff = yield* auth.issueHandoff(
        new AuthPrincipal({
          hostedSubject: "chatgpt-user-1",
          email: "operator@example.com",
          displayName: "Operator",
        }),
        "/projects",
      );

      const wrongNonce = yield* Effect.exit(
        auth.redeemHandoff(handoff.code, Redacted.make("wrong-browser-nonce")),
      );
      assert(Exit.isFailure(wrongNonce));

      const redeemed = yield* auth.redeemHandoff(handoff.code, handoff.browserNonce);
      assert.strictEqual(redeemed.returnPath, "/projects");
      assert.strictEqual(redeemed.session.principal.hostedSubject, "chatgpt-user-1");
      assert.strictEqual(redeemed.session.principal.email, "operator@example.com");

      const duplicate = yield* Effect.exit(auth.redeemHandoff(handoff.code, handoff.browserNonce));
      assert(Exit.isFailure(duplicate));
      assert(
        duplicate.cause.reasons.some(
          (reason) => Cause.isFailReason(reason) && reason.error instanceof InvalidHandoffCode,
        ),
      );

      const active = yield* auth.authenticate(redeemed.sessionToken);
      assert.strictEqual(active.id, redeemed.session.id);

      yield* auth.logout(redeemed.sessionToken);
      const loggedOut = yield* Effect.exit(auth.authenticate(redeemed.sessionToken));
      assert(Exit.isFailure(loggedOut));
      assert(
        loggedOut.cause.reasons.some(
          (reason) => Cause.isFailReason(reason) && reason.error instanceof SessionNotFound,
        ),
      );
    }).pipe(Effect.provide(AuthTest)),
  );

  it.effect("uses constant-time service credential checks", () =>
    Effect.gen(function* () {
      const auth = yield* AuthService;
      yield* auth.validateCollectorCredential("collector-secret");
      yield* auth.validateSitesCredential("sites-secret");
      yield* auth.validateAdminCredential(Redacted.make("0123456789abcdef0123456789abcdef"));

      const rejected = yield* Effect.exit(auth.validateCollectorCredential("incorrect"));
      assert(Exit.isFailure(rejected));

      const rejectedAdmin = yield* Effect.exit(
        auth.validateAdminCredential(Redacted.make("incorrect")),
      );
      assert(Exit.isFailure(rejectedAdmin));
      assert(
        rejectedAdmin.cause.reasons.some(
          (reason) => Cause.isFailReason(reason) && reason.error instanceof InvalidAdminCredential,
        ),
      );
    }).pipe(Effect.provide(AuthTest)),
  );

  it.effect("purges expired in-memory handoffs and sessions", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-29T08:00:00.000Z"));
      const auth = yield* AuthService;
      const principal = new AuthPrincipal({
        hostedSubject: "chatgpt-user-1",
        email: "operator@example.com",
        displayName: "Operator",
      });
      const sessionHandoff = yield* auth.issueHandoff(principal, "/projects");
      yield* auth.redeemHandoff(sessionHandoff.code, sessionHandoff.browserNonce);
      yield* auth.issueHandoff(principal, "/settings");

      yield* TestClock.adjust("8 days");

      assert.deepStrictEqual(yield* auth.purgeExpired, { handoffs: 1, sessions: 1 });
      assert.deepStrictEqual(yield* auth.purgeExpired, { handoffs: 0, sessions: 0 });
    }).pipe(Effect.provide(AuthTest)),
  );

  it.effect("keeps scheduled purging alive after a bounded warning", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const attempts = yield* Ref.make(0);
        const messages: Array<unknown> = [];
        const logger = Logger.make(({ message }) => {
          messages.push(message);
        });
        const unexpected = () => Effect.die("Unexpected auth operation");
        const auth = AuthService.of({
          validateCollectorCredential: unexpected,
          validateSitesCredential: unexpected,
          validateAdminCredential: unexpected,
          issueHandoff: unexpected,
          redeemHandoff: unexpected,
          authenticate: unexpected,
          logout: unexpected,
          purgeExpired: Ref.updateAndGet(attempts, (count) => count + 1).pipe(
            Effect.flatMap((attempt) =>
              attempt === 1
                ? Effect.fail(
                    new ServiceUnavailable({
                      service: "authentication",
                      message: "Authentication service is unavailable",
                    }),
                  )
                : Effect.succeed({ handoffs: 0, sessions: 0 }),
            ),
          ),
        });

        yield* Layer.build(
          AuthServiceMaintenance.pipe(
            Layer.provide(Layer.succeed(AuthService, auth)),
            Layer.provide(Logger.layer([logger], { mergeWithExisting: false })),
          ),
        );
        yield* Effect.yieldNow;
        yield* TestClock.adjust("1 day");

        assert.strictEqual(yield* Ref.get(attempts), 2);
        assert.deepStrictEqual(messages, [["Expired authentication-state cleanup failed"]]);
      }),
    ),
  );

  it.effect("disables admin login when no token is configured", () =>
    Effect.gen(function* () {
      const auth = yield* AuthService;
      const rejected = yield* Effect.exit(
        auth.validateAdminCredential(Redacted.make("0123456789abcdef0123456789abcdef")),
      );
      assert(Exit.isFailure(rejected));
      assert(
        rejected.cause.reasons.some(
          (reason) => Cause.isFailReason(reason) && reason.error instanceof AdminLoginDisabled,
        ),
      );
    }).pipe(
      Effect.provide(
        AuthService.layerMemory.pipe(Layer.provide([ConfigDisabled, NodeCrypto.layer])),
      ),
    ),
  );
});
