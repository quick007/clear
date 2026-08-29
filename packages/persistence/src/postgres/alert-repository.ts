import { and, eq } from "drizzle-orm";
import { DateTime, Effect, Layer, Option } from "effect";
import { IdGenerator } from "../ids.ts";
import { AlertRepository } from "../repositories/services.ts";
import { alerts } from "../schema/index.ts";
import { appendOutbox } from "./core-repositories.ts";
import { PostgresDatabase } from "./database.ts";
import { alertFromRow, decodeStored } from "./mappers.ts";

export const AlertRepositoryLive = Layer.effect(
  AlertRepository,
  Effect.gen(function* () {
    const postgres = yield* PostgresDatabase;
    const ids = yield* IdGenerator;

    return AlertRepository.of({
      count: (projectId) =>
        postgres.execute("count-alerts", () =>
          postgres.db.$count(alerts, eq(alerts.projectId, projectId)),
        ),
      create: (projectId, input) =>
        Effect.gen(function* () {
          const id = yield* ids.alert;
          return yield* postgres.execute("create-alert", () =>
            postgres.db.transaction(async (transaction) => {
              const rows = await transaction
                .insert(alerts)
                .values({ id, projectId, ...input })
                .returning();
              await appendOutbox(transaction, projectId, "alert.created", { alertId: id });
              return alertFromRow(rows[0]!);
            }),
          );
        }),
      list: (projectId) =>
        postgres
          .execute("list-alerts", () =>
            postgres.db.query.alerts.findMany({
              where: { projectId: { eq: projectId } },
              orderBy: { createdAt: "desc" },
              limit: 100,
            }),
          )
          .pipe(Effect.flatMap((rows) => decodeStored("alerts", () => rows.map(alertFromRow)))),
      findById: (projectId, id) =>
        postgres
          .execute("find-alert", () =>
            postgres.db.query.alerts.findFirst({
              where: { projectId: { eq: projectId }, id: { eq: id } },
            }),
          )
          .pipe(
            Effect.map(Option.fromNullishOr),
            Effect.flatMap((row) => decodeStored("alert", () => Option.map(row, alertFromRow))),
          ),
      updateState: (projectId, id, input) =>
        postgres.execute("update-alert-state", () =>
          postgres.db.transaction(async (transaction) => {
            const updatedAt = DateTime.toDateUtc(input.updatedAt);
            const rows = await transaction
              .update(alerts)
              .set({
                status: input.status,
                summary: input.summary,
                firingSince:
                  input.firingSince === null ? null : DateTime.toDateUtc(input.firingSince),
                resolvedAt: input.resolvedAt === null ? null : DateTime.toDateUtc(input.resolvedAt),
                updatedAt,
              })
              .where(and(eq(alerts.projectId, projectId), eq(alerts.id, id)))
              .returning();
            const row = rows[0];
            if (row === undefined) return Option.none();
            await appendOutbox(transaction, projectId, "alert.state_changed", {
              alertId: id,
              status: row.status,
              updatedAt: updatedAt.toISOString(),
            });
            return Option.some(alertFromRow(row));
          }),
        ),
      delete: (projectId, id) =>
        postgres.execute("delete-alert", () =>
          postgres.db.transaction(async (transaction) => {
            const rows = await transaction
              .delete(alerts)
              .where(and(eq(alerts.projectId, projectId), eq(alerts.id, id)))
              .returning({ id: alerts.id });
            if (rows[0] === undefined) return false;
            await appendOutbox(transaction, projectId, "alert.updated", {
              alertId: id,
              deleted: true,
            });
            return true;
          }),
        ),
    });
  }),
);
