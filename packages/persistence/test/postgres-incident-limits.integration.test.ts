import {
  AlertName,
  DisplayName,
  EmailAddress,
  HostedSubject,
  IncidentTitle,
  NonEmptyText,
  ProjectName,
  ProjectSlug,
  ServiceName,
} from "@groundtruth/domain";
import { DateTime, Effect, Layer, ManagedRuntime, Option, Result } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { IdGenerator, IdGeneratorLive } from "../src/ids.ts";
import { NodeCryptoLive } from "../src/node-crypto.ts";
import { CoreRepositoriesLive } from "../src/postgres/core-repositories.ts";
import { PostgresDatabase } from "../src/postgres/database.ts";
import { ProductRepositoriesLive } from "../src/postgres/product-repositories.ts";
import { IncidentHistoryLimits } from "../src/repositories/incident-policy.ts";
import {
  AccountRepository,
  AlertRepository,
  IncidentRepository,
  OutboxRepository,
  ProjectRepository,
} from "../src/repositories/services.ts";
import { timelineEntries } from "../src/schema/incidents.ts";
import { MigratedPostgresTestDatabaseLive } from "../src/testing/services.ts";

const databaseTestsEnabled = ["1", "true"].includes(
  process.env.GROUNDTRUTH_RUN_DATABASE_TESTS?.toLowerCase() ?? "",
);
const startupTimeout = 5 * 60_000; // 5 minutes
const shutdownTimeout = 30_000; // 30 seconds
const testTimeout = 60_000; // 1 minute

const IdentifiersTestLive = IdGeneratorLive.pipe(Layer.provide(NodeCryptoLive));
const RepositoryDependenciesTestLive = Layer.mergeAll(
  MigratedPostgresTestDatabaseLive,
  IdentifiersTestLive,
);
const RepositoriesTestLive = Layer.mergeAll(CoreRepositoriesLive, ProductRepositoriesLive).pipe(
  Layer.provideMerge(RepositoryDependenciesTestLive),
);

const note = (value: string) => NonEmptyText.make(value);

describe.skipIf(!databaseTestsEnabled)("PostgreSQL incident history policy", () => {
  const runtime = ManagedRuntime.make(RepositoriesTestLive);

  beforeAll(() => runtime.runPromise(Effect.void), startupTimeout);
  afterAll(() => runtime.dispose(), shutdownTimeout);

  it(
    "serializes quotas, reserves close capacity, and bounds legacy history reads",
    async () => {
      await runtime.runPromise(
        Effect.gen(function* () {
          const accounts = yield* AccountRepository;
          const projects = yield* ProjectRepository;
          const alerts = yield* AlertRepository;
          const incidents = yield* IncidentRepository;
          const outbox = yield* OutboxRepository;
          const ids = yield* IdGenerator;
          const postgres = yield* PostgresDatabase;
          const account = yield* accounts.upsertHosted({
            hostedSubject: HostedSubject.make("incident-limits@example.com"),
            email: EmailAddress.make("incident-limits@example.com"),
            displayName: DisplayName.make("Incident limits"),
          });
          const project = yield* projects.create({
            ownerId: account.id,
            slug: ProjectSlug.make("incident-limits"),
            name: ProjectName.make("Incident limits"),
            mode: "hosted",
            retentionDays: 7,
            quotas: {
              maxIngestBytesPerMinute: 50_000_000,
              maxActiveSeries: 100_000,
              maxPanels: 100,
            },
          });

          const alert = yield* alerts.create(project.id, {
            name: AlertName.make("Checkout request rate"),
            serviceName: ServiceName.make("checkout-api"),
            metricName: "http.server.requests",
            aggregation: "rate",
            comparison: "above",
            threshold: 100,
            windowSeconds: 60,
            severity: "critical",
            summary: null,
            enabled: true,
          });
          expect(yield* alerts.count(project.id)).toBe(1);
          expect(yield* alerts.delete(yield* ids.project, alert.id)).toBe(false);
          expect(yield* alerts.delete(project.id, alert.id)).toBe(true);
          expect(yield* alerts.count(project.id)).toBe(0);
          expect(Option.getOrThrow(yield* outbox.latest(project.id))).toMatchObject({
            kind: "alert.updated",
            payload: { alertId: alert.id, deleted: true },
          });

          const timelineIncident = yield* incidents.open(project.id, {
            title: IncidentTitle.make("Timeline capacity"),
          });
          const oversized = note("😀".repeat(IncidentHistoryLimits.textCodePoints + 1));
          const textFailure = yield* Effect.flip(
            incidents.addNote(project.id, timelineIncident.id, oversized),
          );
          expect(textFailure).toMatchObject({
            _tag: "RepositoryQuotaExceeded",
            resource: "incident-text",
            limit: IncidentHistoryLimits.textCodePoints,
            observed: IncidentHistoryLimits.textCodePoints + 1,
          });
          expect(yield* incidents.listTimeline(project.id, timelineIncident.id)).toHaveLength(1);

          yield* Effect.forEach(
            Array.from({ length: IncidentHistoryLimits.timelineEntriesBeforeClose - 2 }),
            (_, index) =>
              incidents.addNote(project.id, timelineIncident.id, note(`Seed note ${index + 1}`)),
            { discard: true },
          );
          expect(yield* incidents.listTimeline(project.id, timelineIncident.id)).toHaveLength(198);
          const beforeNoteRace = Option.getOrThrow(yield* outbox.latest(project.id)).sequence;
          const noteRace = yield* Effect.all(
            [
              incidents
                .addNote(project.id, timelineIncident.id, note("Concurrent note A"))
                .pipe(Effect.result),
              incidents
                .addNote(project.id, timelineIncident.id, note("Concurrent note B"))
                .pipe(Effect.result),
            ],
            { concurrency: "unbounded" },
          );
          expect(noteRace.filter(Result.isSuccess)).toHaveLength(1);
          const noteFailure = noteRace.find(Result.isFailure);
          expect(noteFailure?.failure).toMatchObject({
            _tag: "RepositoryQuotaExceeded",
            resource: "incident-timeline",
            limit: IncidentHistoryLimits.timelineEntriesBeforeClose,
            observed: IncidentHistoryLimits.timelineEntriesBeforeClose + 1,
          });
          expect(yield* incidents.listTimeline(project.id, timelineIncident.id)).toHaveLength(
            IncidentHistoryLimits.timelineEntriesBeforeClose,
          );
          expect(yield* outbox.listAfter(project.id, beforeNoteRace, 10)).toHaveLength(1);

          const closed = Option.getOrThrow(
            yield* incidents.close(project.id, timelineIncident.id, note("Recovered")),
          );
          expect(closed.status).toBe("closed");
          const closedTimeline = yield* incidents.listTimeline(project.id, timelineIncident.id);
          expect(closedTimeline).toHaveLength(IncidentHistoryLimits.timelineEntries);
          expect(closedTimeline.at(-1)).toMatchObject({
            _tag: "incident-status",
            status: "closed",
          });
          for (const conflict of [
            yield* Effect.flip(
              incidents.addNote(project.id, timelineIncident.id, note("After close")),
            ),
            yield* Effect.flip(
              incidents.upsertHypothesis(project.id, timelineIncident.id, {
                id: null,
                text: note("After close"),
                status: "proposed",
              }),
            ),
          ]) {
            expect(conflict).toMatchObject({
              _tag: "RepositoryConflict",
              reason: "incident-not-open",
            });
          }

          const hypothesisIncident = yield* incidents.open(project.id, {
            title: IncidentTitle.make("Hypothesis capacity"),
          });
          yield* Effect.forEach(
            Array.from({ length: IncidentHistoryLimits.hypotheses - 1 }),
            (_, index) =>
              incidents.upsertHypothesis(project.id, hypothesisIncident.id, {
                id: null,
                text: note(`Hypothesis ${index + 1}`),
                status: "proposed",
              }),
            { discard: true },
          );
          const hypothesisRace = yield* Effect.all(
            [
              incidents
                .upsertHypothesis(project.id, hypothesisIncident.id, {
                  id: null,
                  text: note("Concurrent hypothesis A"),
                  status: "testing",
                })
                .pipe(Effect.result),
              incidents
                .upsertHypothesis(project.id, hypothesisIncident.id, {
                  id: null,
                  text: note("Concurrent hypothesis B"),
                  status: "testing",
                })
                .pipe(Effect.result),
            ],
            { concurrency: "unbounded" },
          );
          expect(hypothesisRace.filter(Result.isSuccess)).toHaveLength(1);
          expect(hypothesisRace.find(Result.isFailure)?.failure).toMatchObject({
            _tag: "RepositoryQuotaExceeded",
            resource: "incident-hypotheses",
            limit: IncidentHistoryLimits.hypotheses,
            observed: IncidentHistoryLimits.hypotheses + 1,
          });
          expect(
            Option.getOrThrow(yield* incidents.getDetail(project.id, hypothesisIncident.id))
              .hypotheses,
          ).toHaveLength(IncidentHistoryLimits.hypotheses);
          yield* incidents.close(project.id, hypothesisIncident.id, note("Resolved"));

          const legacyIncident = yield* incidents.open(project.id, {
            title: IncidentTitle.make("Legacy overflow"),
          });
          const base = (yield* DateTime.nowAsDate).getTime() + 1_000;
          const fixtureIds = yield* Effect.forEach(
            Array.from({ length: IncidentHistoryLimits.timelineEntries + 5 }),
            () => ids.timelineEntry,
          );
          yield* postgres.execute("seed-legacy-timeline-overflow", () =>
            postgres.db.insert(timelineEntries).values(
              fixtureIds.map((id, index) => {
                const at = new Date(base + index * 1_000);
                return {
                  id,
                  projectId: project.id,
                  incidentId: legacyIncident.id,
                  kind: "note" as const,
                  text: note(`Legacy note ${index}`),
                  occurredAt: new Date(base),
                  createdAt: at,
                };
              }),
            ),
          );
          const legacyTimeline = yield* incidents.listTimeline(project.id, legacyIncident.id);
          const legacyDetail = Option.getOrThrow(
            yield* incidents.getDetail(project.id, legacyIncident.id),
          );
          expect(legacyTimeline).toHaveLength(IncidentHistoryLimits.timelineEntries);
          expect(legacyDetail.timeline).toEqual(legacyTimeline);
          expect(legacyTimeline[0]?.id).toBe(fixtureIds[5]);
          expect(legacyTimeline.at(-1)?.id).toBe(fixtureIds.at(-1));
        }),
      );
    },
    testTimeout,
  );
});
