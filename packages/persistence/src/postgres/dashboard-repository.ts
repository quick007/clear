import { and, eq } from "drizzle-orm";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { IdGenerator } from "../ids.ts";
import { PanelAnnotationRecord } from "../records.ts";
import { DashboardRepository } from "../repositories/services.ts";
import { dashboards, panels, projects } from "../schema/index.ts";
import { appendOutbox } from "./core-repositories.ts";
import { PostgresDatabase } from "./database.ts";
import { dashboardFromRow, decodeStored, panelFromRow } from "./mappers.ts";

const serializable = { isolationLevel: "serializable" } as const;
const dashboardTransaction = { isolationLevel: "read committed" } as const;
const boundedPosition = (position: number, panelCount: number) =>
  Math.min(Math.max(position, 0), panelCount);

export const DashboardRepositoryLive = Layer.effect(
  DashboardRepository,
  Effect.gen(function* () {
    const postgres = yield* PostgresDatabase;
    const ids = yield* IdGenerator;

    return DashboardRepository.of({
      create: (projectId, input) =>
        Effect.gen(function* () {
          const id = yield* ids.dashboard;
          const now = yield* DateTime.nowAsDate;
          return yield* postgres.execute("create-dashboard", () =>
            postgres.db.transaction(async (transaction) => {
              await transaction
                .select({ id: projects.id })
                .from(projects)
                .where(eq(projects.id, projectId))
                .for("update");
              if (input.isDefault) {
                await transaction
                  .update(dashboards)
                  .set({ isDefault: false, updatedAt: now })
                  .where(eq(dashboards.projectId, projectId));
              }
              const rows = await transaction
                .insert(dashboards)
                .values({ id, projectId, ...input, createdAt: now, updatedAt: now })
                .returning();
              await appendOutbox(transaction, projectId, "dashboard.created", {
                dashboardId: id,
              });
              return dashboardFromRow(rows[0]!, []);
            }, dashboardTransaction),
          );
        }),
      findById: (projectId, id) =>
        postgres
          .execute("find-dashboard", () =>
            postgres.db.query.dashboards.findFirst({
              where: { projectId: { eq: projectId }, id: { eq: id } },
              with: { panels: { orderBy: { position: "asc", id: "asc" } } },
            }),
          )
          .pipe(
            Effect.map(Option.fromNullishOr),
            Effect.flatMap((row) =>
              decodeStored("dashboard", () =>
                Option.map(row, (stored) => dashboardFromRow(stored, stored.panels)),
              ),
            ),
          ),
      list: (projectId) =>
        postgres
          .execute("list-dashboards", () =>
            postgres.db.query.dashboards.findMany({
              where: { projectId: { eq: projectId } },
              orderBy: { createdAt: "asc" },
              with: { panels: { orderBy: { position: "asc", id: "asc" } } },
              limit: 100,
            }),
          )
          .pipe(
            Effect.flatMap((rows) =>
              decodeStored("dashboards", () =>
                rows.map((row) => dashboardFromRow(row, row.panels)),
              ),
            ),
          ),
      seedIfEmpty: (projectId, input) =>
        Effect.gen(function* () {
          const dashboardId = yield* ids.dashboard;
          const panelIds = yield* Effect.forEach(input.panels, () => ids.panel);
          const now = yield* DateTime.nowAsDate;
          return yield* postgres.execute("seed-dashboard", () =>
            postgres.db.transaction(async (transaction) => {
              const lockedProject = await transaction
                .select({ id: projects.id })
                .from(projects)
                .where(eq(projects.id, projectId))
                .for("update");
              if (lockedProject[0] === undefined) throw new Error("Active project not found");
              const existing = await transaction.query.dashboards.findFirst({
                where: { projectId: { eq: projectId } },
              });
              if (existing !== undefined) return Option.none();

              const dashboardRows = await transaction
                .insert(dashboards)
                .values({
                  id: dashboardId,
                  projectId,
                  name: input.name,
                  description: input.description,
                  isDefault: input.isDefault,
                  createdAt: now,
                  updatedAt: now,
                })
                .returning();
              const panelRows =
                input.panels.length === 0
                  ? []
                  : await transaction
                      .insert(panels)
                      .values(
                        input.panels.map((panel, index) => ({
                          id: panelIds[index]!,
                          projectId,
                          dashboardId,
                          title: panel.title,
                          spec: panel.spec,
                          position: panel.position,
                          createdAt: now,
                          updatedAt: now,
                        })),
                      )
                      .returning();
              await appendOutbox(transaction, projectId, "dashboard.created", { dashboardId });
              for (const panel of panelRows) {
                await appendOutbox(transaction, projectId, "panel.created", {
                  dashboardId,
                  panelId: panel.id,
                });
              }
              return Option.some(dashboardFromRow(dashboardRows[0]!, panelRows));
            }, dashboardTransaction),
          );
        }),
      addPanel: (projectId, input) =>
        Effect.gen(function* () {
          const id = yield* ids.panel;
          const now = yield* DateTime.nowAsDate;
          return yield* postgres.execute("create-panel", () =>
            postgres.db.transaction(async (transaction) => {
              const dashboard = await transaction.query.dashboards.findFirst({
                where: { projectId: { eq: projectId }, id: { eq: input.dashboardId } },
              });
              if (dashboard === undefined) throw new Error("Dashboard not found in project");
              const siblings = await transaction.query.panels.findMany({
                where: { projectId: { eq: projectId }, dashboardId: { eq: input.dashboardId } },
                orderBy: { position: "asc", id: "asc" },
              });
              const position = boundedPosition(input.position, siblings.length);
              for (const [index, sibling] of siblings.entries()) {
                const nextPosition = index < position ? index : index + 1;
                if (sibling.position === nextPosition) continue;
                const updated = await transaction
                  .update(panels)
                  .set({ position: nextPosition, revision: sibling.revision + 1, updatedAt: now })
                  .where(
                    and(
                      eq(panels.projectId, projectId),
                      eq(panels.id, sibling.id),
                      eq(panels.revision, sibling.revision),
                    ),
                  )
                  .returning({ revision: panels.revision });
                if (updated[0] === undefined) throw new Error("Concurrent panel reorder");
                await appendOutbox(transaction, projectId, "panel.updated", {
                  dashboardId: input.dashboardId,
                  panelId: sibling.id,
                  revision: updated[0].revision,
                });
              }
              const rows = await transaction
                .insert(panels)
                .values({ id, projectId, ...input, position, createdAt: now, updatedAt: now })
                .returning();
              await transaction
                .update(dashboards)
                .set({ updatedAt: now })
                .where(
                  and(eq(dashboards.projectId, projectId), eq(dashboards.id, input.dashboardId)),
                );
              await appendOutbox(transaction, projectId, "panel.created", {
                dashboardId: input.dashboardId,
                panelId: id,
              });
              return panelFromRow(rows[0]!);
            }, serializable),
          );
        }),
      updatePanel: (projectId, panelId, input) =>
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;
          return yield* postgres.execute("update-panel", () =>
            postgres.db.transaction(async (transaction) => {
              const target = await transaction.query.panels.findFirst({
                where: { projectId: { eq: projectId }, id: { eq: panelId } },
              });
              if (target?.revision !== input.expectedRevision) return Option.none();
              const siblings = await transaction.query.panels.findMany({
                where: {
                  projectId: { eq: projectId },
                  dashboardId: { eq: target.dashboardId },
                  id: { ne: panelId },
                },
                orderBy: { position: "asc", id: "asc" },
              });
              const position = boundedPosition(input.position, siblings.length);
              const ordered = [...siblings];
              ordered.splice(position, 0, target);
              let updatedTarget: typeof target | undefined;
              for (const [nextPosition, current] of ordered.entries()) {
                const isTarget = current.id === panelId;
                if (!isTarget && current.position === nextPosition) continue;
                const rows = await transaction
                  .update(panels)
                  .set({
                    ...(isTarget ? { title: input.title, spec: input.spec } : {}),
                    position: nextPosition,
                    revision: current.revision + 1,
                    updatedAt: now,
                  })
                  .where(
                    and(
                      eq(panels.projectId, projectId),
                      eq(panels.id, current.id),
                      eq(panels.revision, current.revision),
                    ),
                  )
                  .returning();
                const row = rows[0];
                if (row === undefined) throw new Error("Concurrent panel reorder");
                await appendOutbox(transaction, projectId, "panel.updated", {
                  dashboardId: target.dashboardId,
                  panelId: row.id,
                  revision: row.revision,
                });
                if (isTarget) updatedTarget = row;
              }
              await transaction
                .update(dashboards)
                .set({ updatedAt: now })
                .where(
                  and(eq(dashboards.projectId, projectId), eq(dashboards.id, target.dashboardId)),
                );
              return Option.fromNullishOr(
                updatedTarget === undefined ? undefined : panelFromRow(updatedTarget),
              );
            }, serializable),
          );
        }),
      annotatePanel: (projectId, panelId, annotation) =>
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;
          const encoded = Schema.encodeSync(PanelAnnotationRecord)(annotation);
          return yield* postgres.execute("annotate-panel", () =>
            postgres.db.transaction(async (transaction) => {
              const current = await transaction.query.panels.findFirst({
                where: { projectId: { eq: projectId }, id: { eq: panelId } },
              });
              if (current === undefined) return Option.none();
              const rows = await transaction
                .update(panels)
                .set({
                  annotations: [...current.annotations, encoded],
                  revision: current.revision + 1,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(panels.projectId, projectId),
                    eq(panels.id, panelId),
                    eq(panels.revision, current.revision),
                  ),
                )
                .returning();
              const row = rows[0];
              if (row === undefined) return Option.none();
              await transaction
                .update(dashboards)
                .set({ updatedAt: now })
                .where(
                  and(eq(dashboards.projectId, projectId), eq(dashboards.id, row.dashboardId)),
                );
              await appendOutbox(transaction, projectId, "panel.updated", {
                dashboardId: row.dashboardId,
                panelId,
                revision: row.revision,
                annotationKind: annotation._tag,
              });
              return Option.some(panelFromRow(row));
            }, serializable),
          );
        }),
      removePanel: (projectId, panelId) =>
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate;
          return yield* postgres.execute("remove-panel", () =>
            postgres.db.transaction(async (transaction) => {
              const target = await transaction.query.panels.findFirst({
                where: { projectId: { eq: projectId }, id: { eq: panelId } },
              });
              if (target === undefined) return false;
              const removed = await transaction
                .delete(panels)
                .where(
                  and(
                    eq(panels.projectId, projectId),
                    eq(panels.id, panelId),
                    eq(panels.revision, target.revision),
                  ),
                )
                .returning({ id: panels.id });
              if (removed[0] === undefined) throw new Error("Concurrent panel removal");
              const siblings = await transaction.query.panels.findMany({
                where: {
                  projectId: { eq: projectId },
                  dashboardId: { eq: target.dashboardId },
                },
                orderBy: { position: "asc", id: "asc" },
              });
              for (const [position, sibling] of siblings.entries()) {
                if (sibling.position === position) continue;
                const rows = await transaction
                  .update(panels)
                  .set({ position, revision: sibling.revision + 1, updatedAt: now })
                  .where(
                    and(
                      eq(panels.projectId, projectId),
                      eq(panels.id, sibling.id),
                      eq(panels.revision, sibling.revision),
                    ),
                  )
                  .returning({ revision: panels.revision });
                if (rows[0] === undefined) throw new Error("Concurrent panel reorder");
                await appendOutbox(transaction, projectId, "panel.updated", {
                  dashboardId: target.dashboardId,
                  panelId: sibling.id,
                  revision: rows[0].revision,
                });
              }
              await transaction
                .update(dashboards)
                .set({ updatedAt: now })
                .where(
                  and(eq(dashboards.projectId, projectId), eq(dashboards.id, target.dashboardId)),
                );
              await appendOutbox(transaction, projectId, "panel.removed", {
                dashboardId: target.dashboardId,
                panelId,
              });
              return true;
            }, serializable),
          );
        }),
    });
  }),
);
