import { ServiceUnavailable } from "@groundtruth/api-contract";
import {
  EntityNotFound,
  IngestKeyId,
  IngestKeyMetadata,
  IngestKeyName,
  IngestKeyRejected,
  type ProjectId,
  QuotaExceeded,
} from "@groundtruth/domain";
import { IngestKeyRepository } from "@groundtruth/persistence";
import {
  Context,
  Crypto,
  DateTime,
  Effect,
  Encoding,
  Layer,
  Option,
  Redacted,
  Ref,
  Schema,
  Semaphore,
} from "effect";
import { timingSafeEqual } from "node:crypto";
import { BackendConfig } from "../config/BackendConfig.js";
import { sandboxProjectId } from "../memory/SeedIds.js";

const generatedKeyNamespace = "gtik_";
const generatedPrefixBytes = 9;
const generatedSecretBytes = 32;
const visiblePrefixLength = 12;
const minimumKeyLength = 6;
const maximumKeyLength = 512;
const maximumGenerationAttempts = 5;

export const IngestKeyLimits = {
  activePerProject: 3,
} as const;

const textEncoder = new TextEncoder();

export class IngestKeyUnavailable extends Schema.TaggedError<IngestKeyUnavailable>()(
  "IngestKeyUnavailable",
  {
    operation: Schema.Literals(["generate", "hash", "persist"]),
    message: Schema.String,
  },
) {}

export interface IssuedIngestKey {
  readonly metadata: IngestKeyMetadata;
  readonly key: Redacted.Redacted<string>;
}

interface StoredIngestKey {
  readonly metadata: IngestKeyMetadata;
  readonly secretHash: Uint8Array;
}

interface IngestKeyState {
  readonly records: ReadonlyMap<IngestKeyId, StoredIngestKey>;
}

type VerificationOutcome =
  | { readonly _tag: "unknown" }
  | { readonly _tag: "revoked" }
  | { readonly _tag: "verified"; readonly projectId: ProjectId };

const unavailable = (operation: "generate" | "hash" | "persist") =>
  new IngestKeyUnavailable({
    operation,
    message: `Ingest key ${operation} operation is unavailable`,
  });

const persistenceUnavailable = () =>
  new ServiceUnavailable({
    service: "ingest-keys",
    message: "Ingest key service is unavailable",
  });

const hexadecimal = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const prefixOf = (key: string) => key.slice(0, visiblePrefixLength);

const constantTimeEqual = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && timingSafeEqual(left, right);

const malformed = (key: string) => key.length < minimumKeyLength || key.length > maximumKeyLength;

const notFound = (id: IngestKeyId) =>
  new EntityNotFound({
    entity: "ingest-key",
    id,
    message: "Ingest key not found",
  });

const quotaExceeded = (observed: number) =>
  new QuotaExceeded({
    quota: "active-ingest-keys-per-project",
    limit: IngestKeyLimits.activePerProject,
    observed,
    message: `A project can have at most ${IngestKeyLimits.activePerProject} active ingest keys`,
  });

const revokeMetadata = (metadata: IngestKeyMetadata, revokedAt: DateTime.Utc) =>
  new IngestKeyMetadata({
    id: metadata.id,
    projectId: metadata.projectId,
    name: metadata.name,
    prefix: metadata.prefix,
    status: "revoked",
    createdAt: metadata.createdAt,
    lastUsedAt: metadata.lastUsedAt,
    revokedAt,
  });

const touchMetadata = (metadata: IngestKeyMetadata, lastUsedAt: DateTime.Utc) =>
  new IngestKeyMetadata({
    id: metadata.id,
    projectId: metadata.projectId,
    name: metadata.name,
    prefix: metadata.prefix,
    status: metadata.status,
    createdAt: metadata.createdAt,
    lastUsedAt,
    revokedAt: metadata.revokedAt,
  });

export class IngestKeyService extends Context.Service<
  IngestKeyService,
  {
    create(
      projectId: ProjectId,
      name: IngestKeyName,
    ): Effect.Effect<IssuedIngestKey, IngestKeyUnavailable | QuotaExceeded>;
    list(projectId: ProjectId): Effect.Effect<ReadonlyArray<IngestKeyMetadata>, ServiceUnavailable>;
    isAuthorizedProject(
      projectId: ProjectId,
    ): Effect.Effect<boolean, IngestKeyUnavailable | ServiceUnavailable>;
    revoke(
      projectId: ProjectId,
      id: IngestKeyId,
    ): Effect.Effect<IngestKeyMetadata, EntityNotFound | ServiceUnavailable>;
    verify(
      presentedKey: string,
    ): Effect.Effect<ProjectId, IngestKeyRejected | IngestKeyUnavailable>;
  }
>()("groundtruth/backend/ingest/IngestKeyService") {
  static readonly layerMemory = Layer.effect(
    IngestKeyService,
    Effect.gen(function* () {
      const config = yield* BackendConfig;
      const crypto = yield* Crypto.Crypto;
      const state = yield* Ref.make<IngestKeyState>({ records: new Map() });
      const mutationGate = yield* Semaphore.make(1);

      const hash = Effect.fn("IngestKeyService.hash")(function* (key: string) {
        return yield* crypto
          .digest("SHA-256", textEncoder.encode(key))
          .pipe(Effect.mapError(() => unavailable("hash")));
      });

      const insert = Effect.fn("IngestKeyService.insert")(function* (
        metadata: IngestKeyMetadata,
        secretHash: Uint8Array,
      ) {
        return yield* Ref.modify(state, (current) => {
          const prefixExists = Array.from(current.records.values()).some(
            (record) => record.metadata.prefix === metadata.prefix,
          );
          if (prefixExists) {
            return [false, current];
          }
          const records = new Map(current.records);
          records.set(metadata.id, { metadata, secretHash });
          return [true, { records }];
        });
      });

      const createUnlocked = Effect.fn("IngestKeyService.createUnlocked")(function* (
        projectId: ProjectId,
        name: IngestKeyName,
      ) {
        const activeCount = Array.from((yield* Ref.get(state)).records.values()).filter(
          (record) =>
            record.metadata.projectId === projectId && record.metadata.status === "active",
        ).length;
        if (activeCount >= IngestKeyLimits.activePerProject) {
          return yield* quotaExceeded(activeCount + 1);
        }
        for (let attempt = 0; attempt < maximumGenerationAttempts; attempt += 1) {
          const [idValue, prefixBytes, secretBytes] = yield* Effect.all([
            crypto.randomUUIDv7,
            crypto.randomBytes(generatedPrefixBytes),
            crypto.randomBytes(generatedSecretBytes),
          ]).pipe(Effect.mapError(() => unavailable("generate")));
          const key = `${generatedKeyNamespace}${Encoding.encodeBase64Url(prefixBytes)}_${Encoding.encodeBase64Url(secretBytes)}`;
          const now = yield* DateTime.now;
          const metadata = new IngestKeyMetadata({
            id: IngestKeyId.make(idValue),
            projectId,
            name,
            prefix: prefixOf(key),
            status: "active",
            createdAt: now,
            lastUsedAt: null,
            revokedAt: null,
          });
          const inserted = yield* insert(metadata, yield* hash(key));
          if (inserted) {
            return { metadata, key: Redacted.make(key) };
          }
        }
        return yield* unavailable("generate");
      });

      const create = Effect.fn("IngestKeyService.create")(
        (projectId: ProjectId, name: IngestKeyName) =>
          mutationGate.withPermits(1)(createUnlocked(projectId, name)),
      );

      const list = Effect.fn("IngestKeyService.list")(function* (projectId: ProjectId) {
        const current = yield* Ref.get(state);
        return Array.from(current.records.values())
          .map((record) => record.metadata)
          .filter((metadata) => metadata.projectId === projectId)
          .sort(
            (left, right) =>
              DateTime.toEpochMillis(right.createdAt) - DateTime.toEpochMillis(left.createdAt),
          );
      });

      const isAuthorizedProject = Effect.fn("IngestKeyService.isAuthorizedProject")(function* (
        projectId: ProjectId,
      ) {
        const current = yield* Ref.get(state);
        return Array.from(current.records.values()).some(
          (record) =>
            record.metadata.projectId === projectId && record.metadata.status === "active",
        );
      });

      const revoke = Effect.fn("IngestKeyService.revoke")(function* (
        projectId: ProjectId,
        id: IngestKeyId,
      ) {
        const now = yield* DateTime.now;
        const metadata = yield* Ref.modify(state, (current) => {
          const found = current.records.get(id);
          if (found === undefined || found.metadata.projectId !== projectId) {
            return [undefined, current];
          }
          if (found.metadata.status === "revoked") {
            return [found.metadata, current];
          }
          const revoked = revokeMetadata(found.metadata, now);
          const records = new Map(current.records);
          records.set(id, { ...found, metadata: revoked });
          return [revoked, { records }];
        });
        if (metadata === undefined) {
          return yield* notFound(id);
        }
        return metadata;
      });

      const verify = Effect.fn("IngestKeyService.verify")(function* (presentedKey: string) {
        if (presentedKey.length === 0) {
          return yield* new IngestKeyRejected({
            reason: "missing",
            message: "Ingest key is required",
          });
        }
        if (malformed(presentedKey)) {
          return yield* new IngestKeyRejected({
            reason: "malformed",
            message: "Ingest key is malformed",
          });
        }

        const presentedHash = yield* hash(presentedKey);
        const now = yield* DateTime.now;
        const outcome = yield* Ref.modify(
          state,
          (current): readonly [VerificationOutcome, IngestKeyState] => {
            let matched: StoredIngestKey | undefined;
            for (const record of current.records.values()) {
              if (constantTimeEqual(record.secretHash, presentedHash)) {
                matched = record;
              }
            }
            if (matched === undefined) {
              return [{ _tag: "unknown" }, current];
            }
            if (matched.metadata.status === "revoked") {
              return [{ _tag: "revoked" }, current];
            }
            const touched = touchMetadata(matched.metadata, now);
            const records = new Map(current.records);
            records.set(touched.id, { ...matched, metadata: touched });
            return [{ _tag: "verified", projectId: touched.projectId }, { records }];
          },
        );

        if (outcome._tag === "unknown") {
          return yield* new IngestKeyRejected({
            reason: "unknown",
            message: "Ingest key is not recognized",
          });
        }
        if (outcome._tag === "revoked") {
          return yield* new IngestKeyRejected({
            reason: "revoked",
            message: "Ingest key has been revoked",
          });
        }
        return outcome.projectId;
      });

      if (config.bootstrapIngestKey !== undefined) {
        const key = Redacted.value(config.bootstrapIngestKey);
        if (malformed(key)) {
          return yield* unavailable("generate");
        }
        const now = yield* DateTime.now;
        const metadata = new IngestKeyMetadata({
          id: IngestKeyId.make(
            yield* crypto.randomUUIDv7.pipe(Effect.mapError(() => unavailable("generate"))),
          ),
          projectId: sandboxProjectId,
          name: IngestKeyName.make("Local collector"),
          prefix: prefixOf(key),
          status: "active",
          createdAt: now,
          lastUsedAt: null,
          revokedAt: null,
        });
        yield* insert(metadata, yield* hash(key));
      }

      return IngestKeyService.of({ create, list, isAuthorizedProject, revoke, verify });
    }),
  );

  static readonly layerPersistence = Layer.effect(
    IngestKeyService,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const repository = yield* IngestKeyRepository;
      const mutationGate = yield* Semaphore.make(1);

      const hash = Effect.fn("IngestKeyService.hash")(function* (key: string) {
        const bytes = yield* crypto
          .digest("SHA-256", textEncoder.encode(key))
          .pipe(Effect.mapError(() => unavailable("hash")));
        return hexadecimal(bytes);
      });

      const createUnlocked = Effect.fn("IngestKeyService.createUnlocked")(function* (
        projectId: ProjectId,
        name: IngestKeyName,
      ) {
        const activeCount = (yield* repository
          .list(projectId)
          .pipe(Effect.mapError(() => unavailable("persist")))).filter(
          (key) => key.status === "active",
        ).length;
        if (activeCount >= IngestKeyLimits.activePerProject) {
          return yield* quotaExceeded(activeCount + 1);
        }
        const [prefixBytes, secretBytes] = yield* Effect.all([
          crypto.randomBytes(generatedPrefixBytes),
          crypto.randomBytes(generatedSecretBytes),
        ]).pipe(Effect.mapError(() => unavailable("generate")));
        const key = `${generatedKeyNamespace}${Encoding.encodeBase64Url(prefixBytes)}_${Encoding.encodeBase64Url(secretBytes)}`;
        const metadata = yield* repository
          .create({
            projectId,
            name,
            prefix: prefixOf(key),
            secretHash: yield* hash(key),
          })
          .pipe(Effect.mapError(() => unavailable("persist")));
        return { metadata, key: Redacted.make(key) };
      });

      const create = Effect.fn("IngestKeyService.create")(
        (projectId: ProjectId, name: IngestKeyName) =>
          mutationGate.withPermits(1)(createUnlocked(projectId, name)),
      );

      const list = Effect.fn("IngestKeyService.list")((projectId: ProjectId) =>
        repository.list(projectId).pipe(Effect.mapError(persistenceUnavailable)),
      );

      const isAuthorizedProject = Effect.fn("IngestKeyService.isAuthorizedProject")(function* (
        projectId: ProjectId,
      ) {
        const keys = yield* repository
          .list(projectId)
          .pipe(Effect.mapError(persistenceUnavailable));
        return keys.some((key) => key.status === "active");
      });

      const revoke = Effect.fn("IngestKeyService.revoke")(function* (
        projectId: ProjectId,
        id: IngestKeyId,
      ) {
        const existing = (yield* repository
          .list(projectId)
          .pipe(Effect.mapError(persistenceUnavailable))).find((key) => key.id === id);
        if (existing === undefined) {
          return yield* notFound(id);
        }
        if (existing.status === "revoked") {
          return existing;
        }
        const result = yield* repository
          .revoke(projectId, id)
          .pipe(Effect.mapError(persistenceUnavailable));
        if (Option.isNone(result)) {
          const concurrentlyRevoked = (yield* repository
            .list(projectId)
            .pipe(Effect.mapError(persistenceUnavailable))).find((key) => key.id === id);
          if (concurrentlyRevoked?.status === "revoked") {
            return concurrentlyRevoked;
          }
          return yield* notFound(id);
        }
        return result.value;
      });

      const verify = Effect.fn("IngestKeyService.verify")(function* (presentedKey: string) {
        if (presentedKey.length === 0) {
          return yield* new IngestKeyRejected({
            reason: "missing",
            message: "Ingest key is required",
          });
        }
        if (malformed(presentedKey)) {
          return yield* new IngestKeyRejected({
            reason: "malformed",
            message: "Ingest key is malformed",
          });
        }
        const result = yield* repository
          .verifyHash(prefixOf(presentedKey), yield* hash(presentedKey))
          .pipe(Effect.mapError(() => unavailable("persist")));
        if (Option.isNone(result)) {
          return yield* new IngestKeyRejected({
            reason: "unknown",
            message: "Ingest key is not recognized or has been revoked",
          });
        }
        return result.value.project.id;
      });

      return IngestKeyService.of({ create, list, isAuthorizedProject, revoke, verify });
    }),
  );

  static readonly layer = this.layerPersistence;
}
