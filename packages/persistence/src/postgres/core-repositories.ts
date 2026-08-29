import { and, eq, isNull } from "drizzle-orm";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { IdGenerator } from "../ids.ts";
import {
  AccountRepository,
  IngestKeyRepository,
  OutboxRepository,
  ProjectRepository,
} from "../repositories/services.ts";
import {
  accounts,
  ingestKeys,
  outboxEvents,
  ProjectQuotas,
  projects,
  type OutboxEventKind,
} from "../schema/index.ts";
import { PostgresDatabase, type GroundtruthDatabase } from "./database.ts";
import {
  accountFromRow,
  decodeStored,
  ingestKeyFromRow,
  outboxFromRow,
  projectFromRow,
} from "./mappers.ts";

type GroundtruthTransaction = Parameters<Parameters<GroundtruthDatabase["transaction"]>[0]>[0];

export const appendOutbox = async (
  database: Pick<GroundtruthTransaction, "insert">,
  projectId: (typeof projects.$inferSelect)["id"],
  kind: OutboxEventKind,
  payload: typeof outboxEvents.$inferInsert.payload,
) => {
  const rows = await database.insert(outboxEvents).values({ projectId, kind, payload }).returning();
  return outboxFromRow(rows[0]!);
};

const makeAccountRepository = Effect.gen(function* () {
  const postgres = yield* PostgresDatabase;
  const ids = yield* IdGenerator;

  return AccountRepository.of({
    upsertHosted: (input) =>
      Effect.gen(function* () {
        const id = yield* ids.user;
        const now = yield* DateTime.nowAsDate;
        return yield* postgres.execute("upsert-account", async () => {
          const rows = await postgres.db
            .insert(accounts)
            .values({ id, ...input, createdAt: now, lastSeenAt: now })
            .onConflictDoUpdate({
              target: accounts.hostedSubject,
              set: { email: input.email, displayName: input.displayName, lastSeenAt: now },
            })
            .returning();
          return accountFromRow(rows[0]!);
        });
      }),
    findById: (id) =>
      postgres
        .execute("find-account", () =>
          postgres.db.query.accounts.findFirst({ where: { id: { eq: id } } }),
        )
        .pipe(
          Effect.map(Option.fromNullishOr),
          Effect.flatMap((row) => decodeStored("account", () => Option.map(row, accountFromRow))),
        ),
    findByHostedSubject: (hostedSubject) =>
      postgres
        .execute("find-account-by-subject", () =>
          postgres.db.query.accounts.findFirst({
            where: { hostedSubject: { eq: hostedSubject } },
          }),
        )
        .pipe(
          Effect.map(Option.fromNullishOr),
          Effect.flatMap((row) => decodeStored("account", () => Option.map(row, accountFromRow))),
        ),
  });
});

const makeProjectRepository = Effect.gen(function* () {
  const postgres = yield* PostgresDatabase;
  const ids = yield* IdGenerator;

  return ProjectRepository.of({
    create: (input) =>
      Effect.gen(function* () {
        const id = yield* ids.project;
        const now = yield* DateTime.nowAsDate;
        return yield* postgres.execute("create-project", () =>
          postgres.db.transaction(async (transaction) => {
            const rows = await transaction
              .insert(projects)
              .values({ id, ...input, createdAt: now, updatedAt: now })
              .returning();
            await appendOutbox(transaction, id, "project.created", {
              ownerId: input.ownerId,
              slug: input.slug,
            });
            return projectFromRow(rows[0]!);
          }),
        );
      }),
    findById: (id) =>
      postgres
        .execute("find-project", () =>
          postgres.db.query.projects.findFirst({ where: { id: { eq: id } } }),
        )
        .pipe(
          Effect.map(Option.fromNullishOr),
          Effect.flatMap((row) => decodeStored("project", () => Option.map(row, projectFromRow))),
        ),
    findForOwner: (ownerId, id) =>
      postgres
        .execute("find-owner-project", () =>
          postgres.db.query.projects.findFirst({
            where: { ownerId: { eq: ownerId }, id: { eq: id } },
          }),
        )
        .pipe(
          Effect.map(Option.fromNullishOr),
          Effect.flatMap((row) => decodeStored("project", () => Option.map(row, projectFromRow))),
        ),
    findBySlug: (ownerId, slug) =>
      postgres
        .execute("find-project-by-slug", () =>
          postgres.db.query.projects.findFirst({
            where: { ownerId: { eq: ownerId }, slug: { eq: slug } },
          }),
        )
        .pipe(
          Effect.map(Option.fromNullishOr),
          Effect.flatMap((row) => decodeStored("project", () => Option.map(row, projectFromRow))),
        ),
    listForOwner: (ownerId) =>
      postgres
        .execute("list-projects", () =>
          postgres.db.query.projects.findMany({
            where: { ownerId: { eq: ownerId } },
            orderBy: { createdAt: "desc" },
            limit: 100,
          }),
        )
        .pipe(Effect.flatMap((rows) => decodeStored("projects", () => rows.map(projectFromRow)))),
    getQuotas: (id) =>
      postgres
        .execute("get-project-quotas", () =>
          postgres.db.query.projects.findFirst({ where: { id: { eq: id } } }),
        )
        .pipe(
          Effect.map(Option.fromNullishOr),
          Effect.flatMap((row) =>
            decodeStored("project-quotas", () =>
              Option.map(row, (project) => Schema.decodeUnknownSync(ProjectQuotas)(project.quotas)),
            ),
          ),
        ),
    requestDeletion: (ownerId, id) =>
      Effect.gen(function* () {
        const now = yield* DateTime.nowAsDate;
        return yield* postgres.execute("request-project-deletion", () =>
          postgres.db.transaction(async (transaction) => {
            const rows = await transaction
              .update(projects)
              .set({
                lifecycle: "deletion-requested",
                deletionRequestedAt: now,
                purgeError: null,
                updatedAt: now,
              })
              .where(
                and(
                  eq(projects.ownerId, ownerId),
                  eq(projects.id, id),
                  eq(projects.lifecycle, "active"),
                ),
              )
              .returning();
            const row = rows[0];
            if (row === undefined) {
              return Option.none();
            }
            await appendOutbox(transaction, id, "project.deletion_requested", {
              requestedAt: now.toISOString(),
            });
            return Option.some(projectFromRow(row));
          }),
        );
      }),
  });
});

const makeIngestKeyRepository = Effect.gen(function* () {
  const postgres = yield* PostgresDatabase;
  const ids = yield* IdGenerator;

  return IngestKeyRepository.of({
    create: (input) =>
      Effect.gen(function* () {
        const id = yield* ids.ingestKey;
        return yield* postgres.execute("create-ingest-key", () =>
          postgres.db.transaction(async (transaction) => {
            const rows = await transaction
              .insert(ingestKeys)
              .values({
                id,
                projectId: input.projectId,
                name: input.name,
                keyPrefix: input.prefix,
                secretHash: input.secretHash,
              })
              .returning();
            await appendOutbox(transaction, input.projectId, "ingest_key.created", {
              keyId: id,
              prefix: input.prefix,
            });
            return ingestKeyFromRow(rows[0]!);
          }),
        );
      }),
    verifyHash: (keyPrefix, secretHash) =>
      postgres.execute("verify-ingest-key", () =>
        postgres.db.transaction(async (transaction) => {
          const row = await transaction.query.ingestKeys.findFirst({
            where: {
              keyPrefix: { eq: keyPrefix },
              secretHash: { eq: secretHash },
              revokedAt: { isNull: true },
            },
            with: { project: true },
          });
          if (row === undefined || row.project.lifecycle !== "active") {
            return Option.none();
          }
          const now = new Date();
          await transaction
            .update(ingestKeys)
            .set({ lastUsedAt: now })
            .where(and(eq(ingestKeys.id, row.id), isNull(ingestKeys.revokedAt)));
          return Option.some({
            key: ingestKeyFromRow({ ...row, lastUsedAt: now }),
            project: projectFromRow(row.project),
          });
        }),
      ),
    list: (projectId) =>
      postgres
        .execute("list-ingest-keys", () =>
          postgres.db.query.ingestKeys.findMany({
            where: { projectId: { eq: projectId } },
            orderBy: { createdAt: "desc" },
            limit: 100,
          }),
        )
        .pipe(
          Effect.flatMap((rows) => decodeStored("ingest-keys", () => rows.map(ingestKeyFromRow))),
        ),
    revoke: (projectId, id) =>
      Effect.gen(function* () {
        const now = yield* DateTime.nowAsDate;
        return yield* postgres.execute("revoke-ingest-key", () =>
          postgres.db.transaction(async (transaction) => {
            const rows = await transaction
              .update(ingestKeys)
              .set({ revokedAt: now })
              .where(
                and(
                  eq(ingestKeys.projectId, projectId),
                  eq(ingestKeys.id, id),
                  isNull(ingestKeys.revokedAt),
                ),
              )
              .returning();
            const row = rows[0];
            if (row === undefined) {
              return Option.none();
            }
            await appendOutbox(transaction, projectId, "ingest_key.revoked", { keyId: id });
            return Option.some(ingestKeyFromRow(row));
          }),
        );
      }),
  });
});

const makeOutboxRepository = Effect.gen(function* () {
  const postgres = yield* PostgresDatabase;

  return OutboxRepository.of({
    append: (input) =>
      postgres.execute("append-outbox", () =>
        appendOutbox(postgres.db, input.projectId, input.kind, input.payload),
      ),
    find: (projectId, sequence) =>
      postgres
        .execute("find-outbox-event", () =>
          postgres.db.query.outboxEvents.findFirst({
            where: { projectId: { eq: projectId }, sequence: { eq: sequence } },
          }),
        )
        .pipe(
          Effect.map(Option.fromNullishOr),
          Effect.flatMap((row) =>
            decodeStored("outbox-event", () => Option.map(row, outboxFromRow)),
          ),
        ),
    latest: (projectId) =>
      postgres
        .execute("find-latest-outbox-event", () =>
          postgres.db.query.outboxEvents.findFirst({
            where: { projectId: { eq: projectId } },
            orderBy: { sequence: "desc" },
          }),
        )
        .pipe(
          Effect.map(Option.fromNullishOr),
          Effect.flatMap((row) =>
            decodeStored("outbox-event", () => Option.map(row, outboxFromRow)),
          ),
        ),
    listAfter: (projectId, sequence, limit) =>
      postgres
        .execute("list-outbox", () =>
          postgres.db.query.outboxEvents.findMany({
            where: { projectId: { eq: projectId }, sequence: { gt: sequence } },
            orderBy: { sequence: "asc" },
            limit: Math.min(Math.max(limit, 1), 500),
          }),
        )
        .pipe(Effect.flatMap((rows) => decodeStored("outbox", () => rows.map(outboxFromRow)))),
  });
});

export const CoreRepositoriesLive = Layer.mergeAll(
  Layer.effect(AccountRepository, makeAccountRepository),
  Layer.effect(ProjectRepository, makeProjectRepository),
  Layer.effect(IngestKeyRepository, makeIngestKeyRepository),
  Layer.effect(OutboxRepository, makeOutboxRepository),
);
