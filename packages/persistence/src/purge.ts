import type { ProjectId } from "@groundtruth/domain";
import { and, eq, inArray } from "drizzle-orm";
import { Context, DateTime, Effect, Layer } from "effect";
import { TelemetryRepository } from "./clickhouse/telemetry-repository.ts";
import { PurgeError } from "./errors.ts";
import { PostgresDatabase } from "./postgres/database.ts";
import type { AuthPurgeResult } from "./repositories/contracts.ts";
import { HostedSessionRepository } from "./repositories/services.ts";
import { projects } from "./schema/projects.ts";

export type PurgeOutcome =
  | { readonly projectId: ProjectId; readonly status: "deleted" }
  | { readonly projectId: ProjectId; readonly status: "failed"; readonly error: PurgeError };

export interface ProjectPurgerShape {
  readonly runProject: (projectId: ProjectId) => Effect.Effect<boolean, PurgeError>;
  readonly runPending: (limit: number) => Effect.Effect<ReadonlyArray<PurgeOutcome>, PurgeError>;
  readonly purgeAuthState: Effect.Effect<AuthPurgeResult, PurgeError>;
}

export class ProjectPurger extends Context.Service<ProjectPurger, ProjectPurgerShape>()(
  "Groundtruth/ProjectPurger",
) {}

const purgeError = (
  projectId: string,
  phase: PurgeError["phase"],
  error: { readonly message: string; readonly retryable?: boolean },
) =>
  new PurgeError({
    projectId,
    phase,
    message: error.message,
    retryable: error.retryable ?? true,
  });

export const ProjectPurgerLive = Layer.effect(
  ProjectPurger,
  Effect.gen(function* () {
    const postgres = yield* PostgresDatabase;
    const telemetry = yield* TelemetryRepository;
    const sessions = yield* HostedSessionRepository;

    const markFailed = (projectId: ProjectId, error: PurgeError) =>
      Effect.gen(function* () {
        const now = yield* DateTime.nowAsDate;
        yield* postgres.execute("mark-project-purge-failed", () =>
          postgres.db
            .update(projects)
            .set({
              lifecycle: "deletion-failed",
              purgeError: error.message,
              updatedAt: now,
            })
            .where(eq(projects.id, projectId)),
        );
      }).pipe(Effect.ignore);

    const runProject = (projectId: ProjectId) =>
      Effect.gen(function* () {
        const now = yield* DateTime.nowAsDate;
        const claimed = yield* postgres
          .execute("claim-project-purge", async () => {
            const current = await postgres.db.query.projects.findFirst({
              where: {
                id: { eq: projectId },
                lifecycle: { in: ["deletion-requested", "deletion-failed", "deleting"] },
              },
            });
            if (current === undefined) {
              return false;
            }
            const rows = await postgres.db
              .update(projects)
              .set({
                lifecycle: "deleting",
                purgeStartedAt: now,
                purgeAttempt: current.purgeAttempt + 1,
                purgeError: null,
                updatedAt: now,
              })
              .where(
                and(
                  eq(projects.id, projectId),
                  inArray(projects.lifecycle, [
                    "deletion-requested",
                    "deletion-failed",
                    "deleting",
                  ]),
                ),
              )
              .returning({ id: projects.id });
            return rows.length === 1;
          })
          .pipe(Effect.mapError((error) => purgeError(projectId, "marking", error)));

        if (!claimed) {
          return false;
        }

        yield* telemetry.sealAndPurgeProject(projectId).pipe(
          Effect.mapError((error) => purgeError(projectId, "telemetry", error)),
          Effect.tapError((error) => markFailed(projectId, error)),
        );

        yield* postgres
          .execute("delete-project-product-state", () =>
            postgres.db.delete(projects).where(eq(projects.id, projectId)),
          )
          .pipe(
            Effect.mapError((error) => purgeError(projectId, "product-state", error)),
            Effect.tapError((error) => markFailed(projectId, error)),
          );
        return true;
      });

    return ProjectPurger.of({
      runProject,
      purgeAuthState: DateTime.now.pipe(
        Effect.flatMap((now) => sessions.purgeExpired(now)),
        Effect.mapError((error) => purgeError("auth", "auth", error)),
      ),
      runPending: (limit) =>
        postgres
          .execute("list-project-purge-candidates", () =>
            postgres.db.query.projects.findMany({
              where: {
                lifecycle: { in: ["deletion-requested", "deletion-failed", "deleting"] },
              },
              orderBy: { deletionRequestedAt: "asc", createdAt: "asc" },
              limit: Math.min(Math.max(limit, 1), 25),
            }),
          )
          .pipe(
            Effect.mapError((error) => purgeError("pending", "marking", error)),
            Effect.flatMap((candidates) =>
              Effect.forEach(
                candidates,
                (candidate) =>
                  runProject(candidate.id).pipe(
                    Effect.map((): PurgeOutcome => ({
                      projectId: candidate.id,
                      status: "deleted",
                    })),
                    Effect.catch((error) =>
                      Effect.succeed<PurgeOutcome>({
                        projectId: candidate.id,
                        status: "failed",
                        error,
                      }),
                    ),
                  ),
                { concurrency: 1 },
              ),
            ),
          ),
    });
  }),
);
