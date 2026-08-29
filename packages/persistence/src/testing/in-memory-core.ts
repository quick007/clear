import { Account, IngestKeyMetadata, Project, type ProjectId } from "@groundtruth/domain";
import { DateTime, Effect, Layer, Option, Ref } from "effect";
import { persistenceError } from "../errors.ts";
import type { IdGeneratorShape } from "../ids.ts";
import {
  AccountRepository,
  IngestKeyRepository,
  OutboxRepository,
  ProjectRepository,
} from "../repositories/services.ts";
import { appendMemoryOutbox, type RepositoriesMemoryState, updateMap } from "./in-memory-state.ts";

const missing = (operation: string, message: string) =>
  persistenceError("postgres", operation, message, false);

const projectIsActive = (state: RepositoriesMemoryState, projectId: ProjectId) =>
  state.projects.get(projectId)?.lifecycle === "active";

type CreateProjectResult =
  | { readonly _tag: "error"; readonly message: string }
  | { readonly _tag: "ok"; readonly project: Project };

type CreateIngestKeyResult =
  | { readonly _tag: "error"; readonly message: string }
  | { readonly _tag: "ok"; readonly metadata: IngestKeyMetadata };

export const makeCoreRepositoriesMemory = (
  state: Ref.Ref<RepositoriesMemoryState>,
  ids: IdGeneratorShape,
) => {
  const accountRepository = AccountRepository.of({
    upsertHosted: (input) =>
      Effect.gen(function* () {
        const generatedId = yield* ids.user;
        const now = yield* DateTime.now;
        return yield* Ref.modify(state, (current) => {
          const existing = [...current.accounts.values()].find(
            ({ hostedSubject }) => hostedSubject === input.hostedSubject,
          );
          const account = new Account({
            id: existing?.id ?? generatedId,
            hostedSubject: input.hostedSubject,
            email: input.email,
            displayName: input.displayName,
            createdAt: existing?.createdAt ?? now,
            lastSeenAt: now,
          });
          return [
            account,
            { ...current, accounts: updateMap(current.accounts, account.id, account) },
          ];
        });
      }),
    findById: (id) =>
      Ref.get(state).pipe(Effect.map(({ accounts }) => Option.fromNullishOr(accounts.get(id)))),
    findByHostedSubject: (subject) =>
      Ref.get(state).pipe(
        Effect.map(({ accounts }) =>
          Option.fromNullishOr(
            [...accounts.values()].find(({ hostedSubject }) => hostedSubject === subject),
          ),
        ),
      ),
  });

  const projectRepository = ProjectRepository.of({
    create: (input) =>
      Effect.gen(function* () {
        const id = yield* ids.project;
        const now = yield* DateTime.now;
        const result = yield* Ref.modify<RepositoriesMemoryState, CreateProjectResult>(
          state,
          (current) => {
            const duplicate = [...current.projects.values()].some(
              ({ ownerId, slug }) => ownerId === input.ownerId && slug === input.slug,
            );
            if (!current.accounts.has(input.ownerId)) {
              return [{ _tag: "error" as const, message: "project owner does not exist" }, current];
            }
            if (duplicate) {
              return [{ _tag: "error" as const, message: "project slug already exists" }, current];
            }
            const project = new Project({
              id,
              ownerId: input.ownerId,
              slug: input.slug,
              name: input.name,
              mode: input.mode,
              lifecycle: "active",
              retentionDays: input.retentionDays,
              deletionRequestedAt: null,
              deletionFailure: null,
              createdAt: now,
              updatedAt: now,
            });
            const withProject = {
              ...current,
              projects: updateMap(current.projects, id, project),
              projectQuotas: updateMap(current.projectQuotas, id, input.quotas),
            };
            const withEvent = appendMemoryOutbox(
              withProject,
              id,
              "project.created",
              { ownerId: input.ownerId, slug: input.slug },
              now,
            ).state;
            return [{ _tag: "ok" as const, project }, withEvent];
          },
        );
        if (result._tag === "error") {
          return yield* Effect.fail(missing("create-project", result.message));
        }
        return result.project;
      }),
    findById: (id) =>
      Ref.get(state).pipe(Effect.map(({ projects }) => Option.fromNullishOr(projects.get(id)))),
    findForOwner: (ownerId, id) =>
      Ref.get(state).pipe(
        Effect.map(({ projects }) => {
          const project = projects.get(id);
          return Option.fromNullishOr(project?.ownerId === ownerId ? project : undefined);
        }),
      ),
    findBySlug: (ownerId, slug) =>
      Ref.get(state).pipe(
        Effect.map(({ projects }) =>
          Option.fromNullishOr(
            [...projects.values()].find(
              (project) => project.ownerId === ownerId && project.slug === slug,
            ),
          ),
        ),
      ),
    listForOwner: (ownerId) =>
      Ref.get(state).pipe(
        Effect.map(({ projects }) =>
          [...projects.values()]
            .filter((project) => project.ownerId === ownerId)
            .sort(
              (left, right) =>
                DateTime.toEpochMillis(right.createdAt) - DateTime.toEpochMillis(left.createdAt),
            )
            .slice(0, 100),
        ),
      ),
    getQuotas: (id) =>
      Ref.get(state).pipe(
        Effect.map(({ projectQuotas }) => Option.fromNullishOr(projectQuotas.get(id))),
      ),
    requestDeletion: (ownerId, id) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        return yield* Ref.modify(state, (current) => {
          const existing = current.projects.get(id);
          if (existing?.ownerId !== ownerId || existing.lifecycle !== "active") {
            return [Option.none(), current];
          }
          const project = new Project({
            id: existing.id,
            ownerId: existing.ownerId,
            slug: existing.slug,
            name: existing.name,
            mode: existing.mode,
            retentionDays: existing.retentionDays,
            createdAt: existing.createdAt,
            lifecycle: "deletion-requested",
            deletionRequestedAt: now,
            deletionFailure: null,
            updatedAt: now,
          });
          const withProject = {
            ...current,
            projects: updateMap(current.projects, id, project),
          };
          const withEvent = appendMemoryOutbox(
            withProject,
            id,
            "project.deletion_requested",
            { requestedAt: DateTime.formatIso(now) },
            now,
          ).state;
          return [Option.some(project), withEvent];
        });
      }),
  });

  const ingestKeyRepository = IngestKeyRepository.of({
    create: (input) =>
      Effect.gen(function* () {
        const id = yield* ids.ingestKey;
        const now = yield* DateTime.now;
        const result = yield* Ref.modify<RepositoriesMemoryState, CreateIngestKeyResult>(
          state,
          (current) => {
            const duplicate = [...current.ingestKeys.values()].some(
              ({ metadata }) => metadata.prefix === input.prefix,
            );
            if (!projectIsActive(current, input.projectId)) {
              return [
                { _tag: "error" as const, message: "active project does not exist" },
                current,
              ];
            }
            if (duplicate) {
              return [
                { _tag: "error" as const, message: "ingest key prefix already exists" },
                current,
              ];
            }
            const metadata = new IngestKeyMetadata({
              id,
              projectId: input.projectId,
              name: input.name,
              prefix: input.prefix,
              status: "active",
              createdAt: now,
              lastUsedAt: null,
              revokedAt: null,
            });
            const withKey = {
              ...current,
              ingestKeys: updateMap(current.ingestKeys, id, {
                metadata,
                secretHash: input.secretHash,
              }),
            };
            const withEvent = appendMemoryOutbox(
              withKey,
              input.projectId,
              "ingest_key.created",
              { keyId: id, prefix: input.prefix },
              now,
            ).state;
            return [{ _tag: "ok" as const, metadata }, withEvent];
          },
        );
        if (result._tag === "error") {
          return yield* Effect.fail(missing("create-ingest-key", result.message));
        }
        return result.metadata;
      }),
    verifyHash: (prefix, secretHash) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        return yield* Ref.modify(state, (current) => {
          const match = [...current.ingestKeys.entries()].find(
            ([, key]) =>
              key.metadata.prefix === prefix &&
              key.metadata.status === "active" &&
              key.secretHash === secretHash,
          );
          if (match === undefined) return [Option.none(), current];
          const [id, stored] = match;
          const project = current.projects.get(stored.metadata.projectId);
          if (project?.lifecycle !== "active") return [Option.none(), current];
          const metadata = new IngestKeyMetadata({
            id: stored.metadata.id,
            projectId: stored.metadata.projectId,
            name: stored.metadata.name,
            prefix: stored.metadata.prefix,
            status: stored.metadata.status,
            createdAt: stored.metadata.createdAt,
            lastUsedAt: now,
            revokedAt: stored.metadata.revokedAt,
          });
          const ingestKeys = updateMap(current.ingestKeys, id, { ...stored, metadata });
          return [Option.some({ key: metadata, project }), { ...current, ingestKeys }];
        });
      }),
    list: (projectId) =>
      Ref.get(state).pipe(
        Effect.map(({ ingestKeys }) =>
          [...ingestKeys.values()]
            .map(({ metadata }) => metadata)
            .filter((key) => key.projectId === projectId)
            .sort(
              (left, right) =>
                DateTime.toEpochMillis(right.createdAt) - DateTime.toEpochMillis(left.createdAt),
            )
            .slice(0, 100),
        ),
      ),
    revoke: (projectId, id) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        return yield* Ref.modify(state, (current) => {
          const stored = current.ingestKeys.get(id);
          if (stored?.metadata.projectId !== projectId || stored.metadata.status !== "active") {
            return [Option.none(), current];
          }
          const metadata = new IngestKeyMetadata({
            id: stored.metadata.id,
            projectId: stored.metadata.projectId,
            name: stored.metadata.name,
            prefix: stored.metadata.prefix,
            createdAt: stored.metadata.createdAt,
            lastUsedAt: stored.metadata.lastUsedAt,
            status: "revoked",
            revokedAt: now,
          });
          const withKey = {
            ...current,
            ingestKeys: updateMap(current.ingestKeys, id, { ...stored, metadata }),
          };
          const withEvent = appendMemoryOutbox(
            withKey,
            projectId,
            "ingest_key.revoked",
            { keyId: id },
            now,
          ).state;
          return [Option.some(metadata), withEvent];
        });
      }),
  });

  const outboxRepository = OutboxRepository.of({
    append: (input) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        const result = yield* Ref.modify(state, (current) => {
          if (!current.projects.has(input.projectId)) return [Option.none(), current];
          const appended = appendMemoryOutbox(
            current,
            input.projectId,
            input.kind,
            input.payload,
            now,
          );
          return [Option.some(appended.event), appended.state];
        });
        return yield* Option.match(result, {
          onNone: () => Effect.fail(missing("append-outbox", "project does not exist")),
          onSome: Effect.succeed,
        });
      }),
    find: (projectId, sequence) =>
      Ref.get(state).pipe(
        Effect.map(({ outbox }) =>
          Option.fromNullishOr(
            outbox.find((event) => event.projectId === projectId && event.sequence === sequence),
          ),
        ),
      ),
    latest: (projectId) =>
      Ref.get(state).pipe(
        Effect.map(({ outbox }) =>
          Option.fromNullishOr(outbox.findLast((event) => event.projectId === projectId)),
        ),
      ),
    listAfter: (projectId, sequence, limit) =>
      Ref.get(state).pipe(
        Effect.map(({ outbox }) =>
          outbox
            .filter((event) => event.projectId === projectId && event.sequence > sequence)
            .slice(0, Math.min(Math.max(limit, 1), 500)),
        ),
      ),
  });

  return Layer.mergeAll(
    Layer.succeed(AccountRepository, accountRepository),
    Layer.succeed(ProjectRepository, projectRepository),
    Layer.succeed(IngestKeyRepository, ingestKeyRepository),
    Layer.succeed(OutboxRepository, outboxRepository),
  );
};
