import { DateTime, Effect, Layer, Option } from "effect";
import { IdGenerator } from "../ids.ts";
import { ManualAlertRepository } from "../repositories/services.ts";
import { manualAlerts } from "../schema/index.ts";
import { appendOutbox } from "./core-repositories.ts";
import { PostgresDatabase } from "./database.ts";
import { decodeStored, manualAlertFromRow } from "./mappers.ts";

export const ManualAlertRepositoryLive = Layer.effect(
  ManualAlertRepository,
  Effect.gen(function* () {
    const postgres = yield* PostgresDatabase;
    const ids = yield* IdGenerator;

    return ManualAlertRepository.of({
      create: (projectId, input) =>
        Effect.gen(function* () {
          const id = yield* ids.alert;
          const createdAt = yield* DateTime.nowAsDate;
          return yield* postgres.execute("create-manual-alert", () =>
            postgres.db.transaction(async (transaction) => {
              const rows = await transaction
                .insert(manualAlerts)
                .values({ id, projectId, ...input, createdAt })
                .returning();
              await appendOutbox(transaction, projectId, "alert.created", {
                alertId: id,
                manual: true,
              });
              return manualAlertFromRow(rows[0]!);
            }),
          );
        }),
      list: (projectId) =>
        postgres
          .execute("list-manual-alerts", () =>
            postgres.db.query.manualAlerts.findMany({
              where: { projectId: { eq: projectId } },
              orderBy: { createdAt: "desc" },
              limit: 100,
            }),
          )
          .pipe(
            Effect.flatMap((rows) =>
              decodeStored("manual-alerts", () => rows.map(manualAlertFromRow)),
            ),
          ),
      findById: (projectId, id) =>
        postgres
          .execute("find-manual-alert", () =>
            postgres.db.query.manualAlerts.findFirst({
              where: { projectId: { eq: projectId }, id: { eq: id } },
            }),
          )
          .pipe(
            Effect.map(Option.fromNullishOr),
            Effect.flatMap((row) =>
              decodeStored("manual-alert", () => Option.map(row, manualAlertFromRow)),
            ),
          ),
    });
  }),
);
