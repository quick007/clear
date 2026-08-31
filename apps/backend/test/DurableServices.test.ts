import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  Account,
  DisplayName,
  EmailAddress,
  HostedSubject,
  IngestKeyName,
  UserId,
} from "@groundtruth/domain";
import { PersistenceMemory, RepositoriesMemoryControl } from "@groundtruth/persistence/testing";
import { Context, DateTime, Effect, Layer, Redacted } from "effect";
import { TestClock } from "effect/testing";
import { AuthService } from "../src/auth/AuthService.js";
import { BackendConfig } from "../src/config/BackendConfig.js";
import { IdentityService } from "../src/identity/IdentityService.js";
import { authorizeCollectorProject } from "../src/http/CollectorHandlers.js";
import { IngestKeyService } from "../src/ingest/IngestKeyService.js";

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
    sandboxSessionLimit: 100,
    sandboxCreationsPerMinute: 10,
    authenticatedRequestsPerMinute: 300,
    publicRequestsPerMinute: 10_000,
  }),
);

class ReconstructedAuthService extends Context.Service<
  ReconstructedAuthService,
  AuthService["Service"]
>()("groundtruth/backend/test/ReconstructedAuthService") {}

const ReconstructedAuthLive = Layer.effect(
  ReconstructedAuthService,
  Effect.map(AuthService, ReconstructedAuthService.of),
).pipe(Layer.provide(Layer.fresh(AuthService.layerPersistence)));

const DurableServicesTest = Layer.mergeAll(
  AuthService.layerPersistence,
  ReconstructedAuthLive,
  IdentityService.layerPersistence,
  IngestKeyService.layerPersistence,
).pipe(
  Layer.provideMerge(PersistenceMemory),
  Layer.provideMerge(ConfigTest),
  Layer.provideMerge(NodeCrypto.layer),
);

const account = new Account({
  id: UserId.make("01993f71-0001-7000-8000-000000000101"),
  hostedSubject: HostedSubject.make("chatgpt-user-1"),
  email: EmailAddress.make("operator@example.com"),
  displayName: DisplayName.make("Operator"),
  createdAt: DateTime.fromDateUnsafe(new Date(0)),
  lastSeenAt: DateTime.fromDateUnsafe(new Date(0)),
});

describe("persistence-backed services", () => {
  it.effect("stores single-use auth state without exposing raw credentials", () =>
    Effect.gen(function* () {
      const auth = yield* AuthService;
      const reconstructedAuth = yield* ReconstructedAuthService;
      const control = yield* RepositoriesMemoryControl;
      const issued = yield* auth.issueHandoff(account, "/projects");
      const redeemed = yield* reconstructedAuth.redeemHandoff(issued.code, issued.browserNonce);

      assert.strictEqual(redeemed.returnPath, "/projects");
      assert.strictEqual(
        (yield* reconstructedAuth.authenticate(redeemed.sessionToken)).session.id,
        redeemed.session.id,
      );
      assert.strictEqual(
        (yield* Effect.flip(auth.redeemHandoff(issued.code, issued.browserNonce)))._tag,
        "InvalidHandoffCode",
      );

      const snapshot = yield* control.snapshot;
      assert.strictEqual(snapshot.authHandoffCount, 1);
      assert.strictEqual("tokenHash" in snapshot.hostedSessions[0]!, false);

      yield* auth.logout(redeemed.sessionToken);
      assert.strictEqual(
        (yield* Effect.flip(auth.authenticate(redeemed.sessionToken)))._tag,
        "SessionNotFound",
      );
    }).pipe(Effect.provide(DurableServicesTest)),
  );

  it.effect("purges expired persisted authentication state", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-29T08:00:00.000Z"));
      const auth = yield* AuthService;
      const control = yield* RepositoriesMemoryControl;
      const sessionHandoff = yield* auth.issueHandoff(account, "/projects");
      yield* auth.redeemHandoff(sessionHandoff.code, sessionHandoff.browserNonce);
      yield* auth.issueHandoff(account, "/settings");

      yield* TestClock.adjust("8 days");

      assert.deepStrictEqual(yield* auth.purgeExpired, { handoffs: 2, sessions: 1 });
      assert.deepStrictEqual(yield* auth.purgeExpired, { handoffs: 0, sessions: 0 });
      const snapshot = yield* control.snapshot;
      assert.strictEqual(snapshot.authHandoffCount, 0);
      assert.strictEqual(snapshot.hostedSessions.length, 0);
    }).pipe(Effect.provide(DurableServicesTest)),
  );

  it.effect("normalizes hosted identity and creates only one default project", () =>
    Effect.gen(function* () {
      const identity = yield* IdentityService;
      const first = yield* identity.resolveHostedIdentity(
        HostedSubject.make("chatgpt-user-1"),
        EmailAddress.make("Operator@Example.com"),
        DisplayName.make("Operator"),
      );
      const second = yield* identity.resolveHostedIdentity(
        HostedSubject.make("chatgpt-user-1"),
        EmailAddress.make("operator@example.com"),
        undefined,
      );

      assert.strictEqual(first.account.id, second.account.id);
      assert.strictEqual(first.account.hostedSubject, "chatgpt-user-1");
      assert.strictEqual(first.projects.length, 1);
      assert.strictEqual(second.projects.length, 1);
      assert.strictEqual(first.projects[0]?.id, second.projects[0]?.id);
    }).pipe(Effect.provide(DurableServicesTest)),
  );

  it.effect("persists only an ingest key hash and rejects it after revocation", () =>
    Effect.gen(function* () {
      const identity = yield* IdentityService;
      const keys = yield* IngestKeyService;
      const control = yield* RepositoriesMemoryControl;
      const resolved = yield* identity.resolveHostedIdentity(
        HostedSubject.make("chatgpt-collector-1"),
        EmailAddress.make("collector@example.com"),
        DisplayName.make("Collector"),
      );
      const project = resolved.projects[0]!;
      const issued = yield* keys.create(project.id, IngestKeyName.make("Primary collector"));
      const sibling = yield* keys.create(project.id, IngestKeyName.make("Secondary collector"));
      yield* keys.create(project.id, IngestKeyName.make("Backup collector"));
      const quota = yield* Effect.flip(
        keys.create(project.id, IngestKeyName.make("Fourth collector")),
      );
      assert.strictEqual(quota._tag, "QuotaExceeded");
      const plaintext = Redacted.value(issued.key);

      assert.match(plaintext, /^gtik_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/);
      assert.strictEqual(yield* keys.verify(plaintext), project.id);
      yield* authorizeCollectorProject(keys, project.id, plaintext);
      assert.strictEqual((yield* keys.list(project.id))[0]?.lastUsedAt !== null, true);
      assert.strictEqual("secretHash" in (yield* control.snapshot).ingestKeys[0]!, false);

      const revoked = yield* keys.revoke(project.id, issued.metadata.id);
      const rotated = yield* keys.create(project.id, IngestKeyName.make("Rotated collector"));
      assert.strictEqual(rotated.metadata.status, "active");
      assert.strictEqual((yield* keys.revoke(project.id, issued.metadata.id)).id, revoked.id);
      const rejected = yield* Effect.flip(keys.verify(plaintext));
      if (rejected._tag !== "IngestKeyRejected") {
        return yield* Effect.die(new Error("Expected the revoked key to be rejected"));
      }
      assert.strictEqual(rejected.reason, "unknown");
      assert.strictEqual(yield* keys.verify(Redacted.value(sibling.key)), project.id);
      const collectorRejected = yield* Effect.flip(
        authorizeCollectorProject(keys, project.id, plaintext),
      );
      assert.strictEqual(collectorRejected._tag, "IngestKeyRejected");
    }).pipe(Effect.provide(DurableServicesTest)),
  );
});
