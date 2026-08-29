import { and, eq } from "drizzle-orm";
import { DateTime, Effect, Layer, Option } from "effect";
import { IdGenerator } from "../ids.ts";
import {
  IncidentHistoryLimits,
  truncateIncidentTimelineText,
} from "../repositories/incident-policy.ts";
import { DeployEventRepository, IncidentRepository } from "../repositories/services.ts";
import { deployEvents, hypotheses, incidents, timelineEntries } from "../schema/index.ts";
import { AlertRepositoryLive } from "./alert-repository.ts";
import { appendOutbox } from "./core-repositories.ts";
import { DashboardRepositoryLive } from "./dashboard-repository.ts";
import { PostgresDatabase } from "./database.ts";
import {
  incidentHypothesisQuota,
  incidentNotOpen,
  incidentMutationSuccess,
  incidentTimelineQuota,
  resolveIncidentMutation,
  validateIncidentText,
} from "./incident-mutation-policy.ts";
import {
  decodeStored,
  deployEventFromRow,
  hypothesisFromRow,
  incidentFromRow,
  timelineFromRow,
} from "./mappers.ts";

const readCommitted = { isolationLevel: "read committed" } as const;

const compareStoredChronology = (
  left: { readonly occurredAt: Date; readonly createdAt: Date; readonly id: string },
  right: { readonly occurredAt: Date; readonly createdAt: Date; readonly id: string },
) =>
  left.occurredAt.getTime() - right.occurredAt.getTime() ||
  left.createdAt.getTime() - right.createdAt.getTime() ||
  left.id.localeCompare(right.id);

const compareStoredHypotheses = (
  left: { readonly createdAt: Date; readonly id: string },
  right: { readonly createdAt: Date; readonly id: string },
) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id);

const makeIncidentRepository = Effect.gen(function* () {
  const postgres = yield* PostgresDatabase;
  const ids = yield* IdGenerator;

  return IncidentRepository.of({
    open: (projectId, input) =>
      Effect.gen(function* () {
        const id = yield* ids.incident;
        const entryId = yield* ids.timelineEntry;
        const now = yield* DateTime.nowAsDate;
        return yield* postgres.execute("open-incident", () =>
          postgres.db.transaction(async (transaction) => {
            const rows = await transaction
              .insert(incidents)
              .values({ id, projectId, ...input, openedAt: now, createdAt: now, updatedAt: now })
              .returning();
            await transaction.insert(timelineEntries).values({
              id: entryId,
              projectId,
              incidentId: id,
              kind: "incident-status",
              text: input.title,
              metadata: { status: "open" },
              occurredAt: now,
            });
            await appendOutbox(transaction, projectId, "incident.opened", { incidentId: id });
            return incidentFromRow(rows[0]!);
          }),
        );
      }),
    findOpen: (projectId) =>
      postgres
        .execute("find-open-incident", () =>
          postgres.db.query.incidents.findFirst({
            where: { projectId: { eq: projectId }, status: "open" },
            orderBy: { openedAt: "desc" },
          }),
        )
        .pipe(
          Effect.map(Option.fromNullishOr),
          Effect.flatMap((row) => decodeStored("incident", () => Option.map(row, incidentFromRow))),
        ),
    getDetail: (projectId, incidentId) =>
      postgres
        .execute("get-incident-detail", () =>
          postgres.db.query.incidents.findFirst({
            where: { projectId: { eq: projectId }, id: { eq: incidentId } },
            with: {
              hypotheses: {
                orderBy: { updatedAt: "desc", id: "desc" },
                limit: IncidentHistoryLimits.hypotheses,
              },
              timeline: {
                orderBy: { createdAt: "desc", id: "desc" },
                limit: IncidentHistoryLimits.timelineEntries,
              },
            },
          }),
        )
        .pipe(
          Effect.flatMap((row) => {
            if (row === undefined) return Effect.succeed(Option.none());
            return Effect.forEach(
              row.timeline.toSorted(compareStoredChronology),
              timelineFromRow,
            ).pipe(
              Effect.flatMap((timeline) =>
                decodeStored("incident-detail", () =>
                  Option.some({
                    incident: incidentFromRow(row),
                    hypotheses: row.hypotheses
                      .toSorted(compareStoredHypotheses)
                      .map(hypothesisFromRow),
                    timeline,
                  }),
                ),
              ),
            );
          }),
        ),
    list: (projectId) =>
      postgres
        .execute("list-incidents", () =>
          postgres.db.query.incidents.findMany({
            where: { projectId: { eq: projectId } },
            orderBy: { openedAt: "desc" },
            limit: 100,
          }),
        )
        .pipe(Effect.flatMap((rows) => decodeStored("incidents", () => rows.map(incidentFromRow)))),
    listTimeline: (projectId, incidentId) =>
      postgres
        .execute("list-timeline", () =>
          postgres.db.query.timelineEntries.findMany({
            where: { projectId: { eq: projectId }, incidentId: { eq: incidentId } },
            orderBy: { createdAt: "desc", id: "desc" },
            limit: IncidentHistoryLimits.timelineEntries,
          }),
        )
        .pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows.toSorted(compareStoredChronology), timelineFromRow),
          ),
        ),
    addNote: (projectId, incidentId, text) =>
      Effect.gen(function* () {
        yield* validateIncidentText(text);
        const id = yield* ids.timelineEntry;
        const result = yield* postgres.execute("add-timeline-note", () =>
          postgres.db.transaction(async (transaction) => {
            const incident = await transaction
              .select({ id: incidents.id })
              .from(incidents)
              .where(
                and(
                  eq(incidents.projectId, projectId),
                  eq(incidents.id, incidentId),
                  eq(incidents.status, "open"),
                ),
              )
              .limit(1)
              .for("update");
            if (incident[0] === undefined) return incidentNotOpen();
            const timeline = await transaction.query.timelineEntries.findMany({
              where: { projectId: { eq: projectId }, incidentId: { eq: incidentId } },
              limit: IncidentHistoryLimits.timelineEntriesBeforeClose,
            });
            if (timeline.length >= IncidentHistoryLimits.timelineEntriesBeforeClose) {
              return incidentTimelineQuota(
                IncidentHistoryLimits.timelineEntriesBeforeClose,
                timeline.length + 1,
              );
            }
            const rows = await transaction
              .insert(timelineEntries)
              .values({ id, projectId, incidentId, kind: "note", text })
              .returning();
            await appendOutbox(transaction, projectId, "timeline.entry_added", {
              incidentId,
              entryId: id,
              kind: "note",
            });
            return incidentMutationSuccess(rows[0]!);
          }, readCommitted),
        );
        const row = yield* resolveIncidentMutation(result);
        return yield* timelineFromRow(row);
      }),
    upsertHypothesis: (projectId, incidentId, input) =>
      Effect.gen(function* () {
        yield* validateIncidentText(input.text);
        const hypothesisId = input.id ?? (yield* ids.hypothesis);
        const entryId = yield* ids.timelineEntry;
        const now = yield* DateTime.nowAsDate;
        const result = yield* postgres.execute("upsert-hypothesis", () =>
          postgres.db.transaction(async (transaction) => {
            const incident = await transaction
              .select({ id: incidents.id })
              .from(incidents)
              .where(
                and(
                  eq(incidents.projectId, projectId),
                  eq(incidents.id, incidentId),
                  eq(incidents.status, "open"),
                ),
              )
              .limit(1)
              .for("update");
            if (incident[0] === undefined) return incidentNotOpen();
            const timeline = await transaction.query.timelineEntries.findMany({
              where: { projectId: { eq: projectId }, incidentId: { eq: incidentId } },
              limit: IncidentHistoryLimits.timelineEntriesBeforeClose,
            });
            if (timeline.length >= IncidentHistoryLimits.timelineEntriesBeforeClose) {
              return incidentTimelineQuota(
                IncidentHistoryLimits.timelineEntriesBeforeClose,
                timeline.length + 1,
              );
            }
            if (input.id === null) {
              const currentHypotheses = await transaction.query.hypotheses.findMany({
                where: { projectId: { eq: projectId }, incidentId: { eq: incidentId } },
                limit: IncidentHistoryLimits.hypotheses,
              });
              if (currentHypotheses.length >= IncidentHistoryLimits.hypotheses) {
                return incidentHypothesisQuota(
                  IncidentHistoryLimits.hypotheses,
                  currentHypotheses.length + 1,
                );
              }
            }
            const rows =
              input.id === null
                ? await transaction
                    .insert(hypotheses)
                    .values({
                      id: hypothesisId,
                      projectId,
                      incidentId,
                      text: input.text,
                      status: input.status,
                      createdAt: now,
                      updatedAt: now,
                    })
                    .returning()
                : await transaction
                    .update(hypotheses)
                    .set({ text: input.text, status: input.status, updatedAt: now })
                    .where(
                      and(
                        eq(hypotheses.projectId, projectId),
                        eq(hypotheses.incidentId, incidentId),
                        eq(hypotheses.id, hypothesisId),
                      ),
                    )
                    .returning();
            const row = rows[0];
            if (row === undefined) return incidentMutationSuccess(Option.none());
            await transaction.insert(timelineEntries).values({
              id: entryId,
              projectId,
              incidentId,
              kind: "hypothesis",
              text: row.text,
              metadata: { hypothesisId, status: row.status },
              occurredAt: now,
            });
            await appendOutbox(transaction, projectId, "hypothesis.changed", {
              incidentId,
              hypothesisId,
              status: row.status,
            });
            return incidentMutationSuccess(Option.some(hypothesisFromRow(row)));
          }, readCommitted),
        );
        return yield* resolveIncidentMutation(result);
      }),
    close: (projectId, incidentId, summary) =>
      Effect.gen(function* () {
        yield* validateIncidentText(summary);
        const entryId = yield* ids.timelineEntry;
        const now = yield* DateTime.nowAsDate;
        const result = yield* postgres.execute("close-incident", () =>
          postgres.db.transaction(async (transaction) => {
            const existing = await transaction
              .select({ id: incidents.id })
              .from(incidents)
              .where(
                and(
                  eq(incidents.projectId, projectId),
                  eq(incidents.id, incidentId),
                  eq(incidents.status, "open"),
                ),
              )
              .limit(1)
              .for("update");
            if (existing[0] === undefined) return incidentMutationSuccess(Option.none());
            const timeline = await transaction.query.timelineEntries.findMany({
              where: { projectId: { eq: projectId }, incidentId: { eq: incidentId } },
              limit: IncidentHistoryLimits.timelineEntries,
            });
            if (timeline.length >= IncidentHistoryLimits.timelineEntries) {
              return incidentTimelineQuota(
                IncidentHistoryLimits.timelineEntries,
                timeline.length + 1,
              );
            }
            const rows = await transaction
              .update(incidents)
              .set({ status: "closed", summary, closedAt: now, updatedAt: now })
              .where(
                and(
                  eq(incidents.projectId, projectId),
                  eq(incidents.id, incidentId),
                  eq(incidents.status, "open"),
                ),
              )
              .returning();
            const row = rows[0];
            if (row === undefined) return incidentMutationSuccess(Option.none());
            await transaction.insert(timelineEntries).values({
              id: entryId,
              projectId,
              incidentId,
              kind: "incident-status",
              text: summary,
              metadata: { status: "closed", summary },
              occurredAt: now,
            });
            await appendOutbox(transaction, projectId, "incident.closed", { incidentId });
            return incidentMutationSuccess(Option.some(incidentFromRow(row)));
          }, readCommitted),
        );
        return yield* resolveIncidentMutation(result);
      }),
  });
});

const makeDeployEventRepository = Effect.gen(function* () {
  const postgres = yield* PostgresDatabase;
  const ids = yield* IdGenerator;

  return DeployEventRepository.of({
    record: (projectId, input) =>
      Effect.gen(function* () {
        const id = yield* ids.deployEvent;
        const entryId = yield* ids.timelineEntry;
        const now = yield* DateTime.nowAsDate;
        return yield* postgres.execute("record-deploy", () =>
          postgres.db.transaction(async (transaction) => {
            const rows = await transaction
              .insert(deployEvents)
              .values({
                id,
                projectId,
                ...input,
                deployedAt: DateTime.toDateUtc(input.deployedAt),
                receivedAt: now,
              })
              .returning();
            const openIncidents = await transaction
              .select({ id: incidents.id })
              .from(incidents)
              .where(and(eq(incidents.projectId, projectId), eq(incidents.status, "open")))
              .limit(1)
              .for("update");
            const openIncident = openIncidents[0];
            if (openIncident !== undefined) {
              const timeline = await transaction.query.timelineEntries.findMany({
                where: { projectId: { eq: projectId }, incidentId: { eq: openIncident.id } },
                limit: IncidentHistoryLimits.timelineEntriesBeforeClose,
              });
              if (timeline.length < IncidentHistoryLimits.timelineEntriesBeforeClose) {
                await transaction.insert(timelineEntries).values({
                  id: entryId,
                  projectId,
                  incidentId: openIncident.id,
                  kind: "deploy",
                  text: truncateIncidentTimelineText(input.description ?? input.sha),
                  metadata: { deployEventId: id, serviceName: input.serviceName, sha: input.sha },
                  occurredAt: DateTime.toDateUtc(input.deployedAt),
                });
              }
            }
            await appendOutbox(transaction, projectId, "deploy.recorded", {
              deployEventId: id,
              serviceName: input.serviceName,
              sha: input.sha,
            });
            return deployEventFromRow(rows[0]!);
          }, readCommitted),
        );
      }),
    list: (projectId, query) =>
      postgres
        .execute("list-deploys", () =>
          postgres.db.query.deployEvents.findMany({
            where: {
              projectId: { eq: projectId },
              deployedAt: { gte: DateTime.toDateUtc(query.since) },
              ...(query.serviceName === undefined
                ? {}
                : { serviceName: { eq: query.serviceName } }),
              ...(query.before === undefined
                ? {}
                : {
                    OR: [
                      { deployedAt: { lt: DateTime.toDateUtc(query.before.deployedAt) } },
                      {
                        deployedAt: { eq: DateTime.toDateUtc(query.before.deployedAt) },
                        id: { lt: query.before.id },
                      },
                    ],
                  }),
            },
            orderBy: { deployedAt: "desc", id: "desc" },
            limit: Math.min(Math.max(query.limit ?? 50, 1), 200) + 1,
          }),
        )
        .pipe(
          Effect.flatMap((rows) =>
            decodeStored("deploy-events", () => {
              const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
              const hasMore = rows.length > limit;
              const events = rows.slice(0, limit).map(deployEventFromRow);
              const last = events.at(-1);
              return {
                events,
                hasMore,
                nextCursor:
                  hasMore && last !== undefined
                    ? { deployedAt: last.deployedAt, id: last.id }
                    : null,
              };
            }),
          ),
        ),
  });
});

export const ProductRepositoriesLive = Layer.mergeAll(
  DashboardRepositoryLive,
  AlertRepositoryLive,
  Layer.effect(IncidentRepository, makeIncidentRepository),
  Layer.effect(DeployEventRepository, makeDeployEventRepository),
);
