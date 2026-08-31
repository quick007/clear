import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { IngestKeyName, ProjectId } from "@groundtruth/domain";
import { Effect, Layer, Redacted } from "effect";
import { BackendConfig } from "../src/config/BackendConfig.js";
import { IngestKeyLimits, IngestKeyService } from "../src/ingest/IngestKeyService.js";
import { sandboxProjectId } from "../src/memory/SeedIds.js";

const otherProjectId = ProjectId.make("01993f71-0001-7000-8000-0000000000ff");

const configLayer = (bootstrapIngestKey?: string) =>
  Layer.succeed(
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
      bootstrapIngestKey:
        bootstrapIngestKey === undefined ? undefined : Redacted.make(bootstrapIngestKey),
      publicStatusEnabled: false,
      sandboxSessionLimit: 100,
      sandboxCreationsPerMinute: 10,
      authenticatedRequestsPerMinute: 300,
      publicRequestsPerMinute: 10_000,
    }),
  );

const serviceLayer = (bootstrapIngestKey?: string) =>
  IngestKeyService.layerMemory.pipe(
    Layer.provide([configLayer(bootstrapIngestKey), NodeCrypto.layer]),
  );

describe("IngestKeyService", () => {
  it.effect("issues a secret once, verifies it, and revokes it", () =>
    Effect.gen(function* () {
      const keys = yield* IngestKeyService;
      const issued = yield* keys.create(
        sandboxProjectId,
        IngestKeyName.make("Production collector"),
      );
      const plaintext = Redacted.value(issued.key);

      assert.match(plaintext, /^gtik_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/);
      assert.strictEqual(issued.metadata.prefix, plaintext.slice(0, 12));

      const beforeUse = yield* keys.list(sandboxProjectId);
      assert.strictEqual(beforeUse.length, 1);
      assert.strictEqual(beforeUse[0]?.lastUsedAt, null);
      assert(!("key" in beforeUse[0]!));
      assert.strictEqual(yield* keys.isAuthorizedProject(sandboxProjectId), true);
      assert.strictEqual(yield* keys.isAuthorizedProject(otherProjectId), false);

      const verifiedProjectId = yield* keys.verify(plaintext);
      assert.strictEqual(verifiedProjectId, sandboxProjectId);
      const afterUse = yield* keys.list(sandboxProjectId);
      assert.notStrictEqual(afterUse[0]?.lastUsedAt, null);

      const tampered = `${plaintext.slice(0, -1)}${plaintext.endsWith("a") ? "b" : "a"}`;
      const unknown = yield* Effect.flip(keys.verify(tampered));
      assert(unknown._tag === "IngestKeyRejected");
      assert.strictEqual(unknown.reason, "unknown");

      const hidden = yield* Effect.flip(keys.revoke(otherProjectId, issued.metadata.id));
      assert.strictEqual(hidden._tag, "EntityNotFound");

      const revoked = yield* keys.revoke(sandboxProjectId, issued.metadata.id);
      assert.strictEqual(revoked.status, "revoked");
      assert.notStrictEqual(revoked.revokedAt, null);
      assert.strictEqual(yield* keys.isAuthorizedProject(sandboxProjectId), false);

      const rejected = yield* Effect.flip(keys.verify(plaintext));
      assert(rejected._tag === "IngestKeyRejected");
      assert.strictEqual(rejected.reason, "revoked");
    }).pipe(Effect.provide(serviceLayer())),
  );

  it.effect("hashes the optional configured sandbox bootstrap key", () =>
    Effect.gen(function* () {
      const keys = yield* IngestKeyService;
      const listed = yield* keys.list(sandboxProjectId);

      assert.strictEqual(listed.length, 1);
      assert.strictEqual(listed[0]?.name, "Local collector");
      assert.strictEqual(listed[0]?.prefix, "local-demo-i");
      assert.strictEqual(yield* keys.isAuthorizedProject(sandboxProjectId), true);
      assert.strictEqual(yield* keys.verify("local-demo-ingest-key"), sandboxProjectId);
    }).pipe(Effect.provide(serviceLayer("local-demo-ingest-key"))),
  );

  it.effect("distinguishes missing and malformed credentials", () =>
    Effect.gen(function* () {
      const keys = yield* IngestKeyService;
      const missing = yield* Effect.flip(keys.verify(""));
      const malformed = yield* Effect.flip(keys.verify("short"));

      assert(missing._tag === "IngestKeyRejected");
      assert.strictEqual(missing.reason, "missing");
      assert(malformed._tag === "IngestKeyRejected");
      assert.strictEqual(malformed.reason, "malformed");
    }).pipe(Effect.provide(serviceLayer())),
  );

  it.effect("limits a project to three active ingest keys while allowing rotation", () =>
    Effect.gen(function* () {
      const keys = yield* IngestKeyService;
      const issued = yield* Effect.forEach(
        Array.from({ length: IngestKeyLimits.activePerProject }, (_, index) => index),
        (index) => keys.create(sandboxProjectId, IngestKeyName.make(`Collector ${index + 1}`)),
      );

      const rejected = yield* Effect.flip(
        keys.create(sandboxProjectId, IngestKeyName.make("Collector 4")),
      );
      assert.strictEqual(rejected._tag, "QuotaExceeded");
      if (rejected._tag !== "QuotaExceeded") return;
      assert.strictEqual(rejected.quota, "active-ingest-keys-per-project");
      assert.strictEqual(rejected.limit, IngestKeyLimits.activePerProject);

      yield* keys.revoke(sandboxProjectId, issued[0]!.metadata.id);
      const rotated = yield* keys.create(sandboxProjectId, IngestKeyName.make("Rotated collector"));
      assert.strictEqual(rotated.metadata.status, "active");
      assert.strictEqual(
        (yield* keys.list(sandboxProjectId)).filter((key) => key.status === "active").length,
        IngestKeyLimits.activePerProject,
      );
    }).pipe(Effect.provide(serviceLayer())),
  );
});
