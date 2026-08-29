import { assert, describe, it } from "@effect/vitest";
import { NodeCrypto } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer, Redacted } from "effect";
import {
  AuthPrincipal,
  AuthService,
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
