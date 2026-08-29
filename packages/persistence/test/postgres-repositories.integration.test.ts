import {
  AlertName,
  DashboardName,
  DisplayName,
  EmailAddress,
  HostedSubject,
  IncidentTitle,
  NonEmptyText,
  PanelTitle,
  ProjectId,
  ProjectName,
  ProjectSlug,
  ServiceName,
  SessionId,
  Sha,
  UserId,
} from "@groundtruth/domain";
import { RequestsVsUsersPanel } from "@groundtruth/panel-dsl";
import { DateTime, Effect, Layer, ManagedRuntime, Option, Schema } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { IdGeneratorLive } from "../src/ids.ts";
import { NodeCryptoLive } from "../src/node-crypto.ts";
import { AuthRepositoriesLive } from "../src/postgres/auth-repositories.ts";
import { CoreRepositoriesLive } from "../src/postgres/core-repositories.ts";
import { ProductRepositoriesLive } from "../src/postgres/product-repositories.ts";
import { PanelNoteAnnotation } from "../src/records.ts";
import {
  AlertRepository,
  AuthHandoffRepository,
  DashboardRepository,
  DeployEventRepository,
  HostedSessionRepository,
  IncidentRepository,
  OutboxRepository,
  ProjectRepository,
} from "../src/repositories/services.ts";
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
const PostgresRepositoriesTestLive = Layer.mergeAll(
  CoreRepositoriesLive,
  AuthRepositoriesLive,
  ProductRepositoriesLive,
).pipe(Layer.provideMerge(RepositoryDependenciesTestLive));

const addMilliseconds = (dateTime: DateTime.Utc, milliseconds: number) =>
  DateTime.fromDateUnsafe(new Date(DateTime.toEpochMillis(dateTime) + milliseconds));

describe.skipIf(!databaseTestsEnabled)("PostgreSQL repositories", () => {
  const runtime = ManagedRuntime.make(PostgresRepositoriesTestLive);

  beforeAll(() => runtime.runPromise(Effect.void), startupTimeout);
  afterAll(() => runtime.dispose(), shutdownTimeout);

  it(
    "atomically redeems handoffs and enforces the hosted session lifecycle",
    async () => {
      await runtime.runPromise(
        Effect.gen(function* () {
          const handoffs = yield* AuthHandoffRepository;
          const sessions = yield* HostedSessionRepository;
          const now = yield* DateTime.now;
          const sessionId = Schema.decodeUnknownSync(SessionId)(
            "0198f1a2-3b4c-7def-a345-6789abcdef01",
          );
          const input = {
            codeHash: "handoff-sha256",
            hostedSubject: HostedSubject.make("operator@example.com"),
            email: EmailAddress.make("operator@example.com"),
            displayName: DisplayName.make("Operator"),
            returnPath: "/projects/checkout",
            createdAt: now,
            expiresAt: addMilliseconds(now, 60_000),
          };

          yield* handoffs.issue(input);
          const redeemed = yield* handoffs.redeem({
            codeHash: input.codeHash,
            redeemedAt: now,
            sessionId,
            tokenHash: "session-sha256",
            sessionExpiresAt: addMilliseconds(now, 3_600_000),
          });
          expect(Option.isSome(redeemed)).toBe(true);
          expect(Option.getOrThrow(redeemed).returnPath).toBe(input.returnPath);

          const secondRedemption = yield* handoffs.redeem({
            codeHash: input.codeHash,
            redeemedAt: now,
            sessionId,
            tokenHash: "different-token-sha256",
            sessionExpiresAt: addMilliseconds(now, 3_600_000),
          });
          expect(Option.isNone(secondRedemption)).toBe(true);

          const active = yield* sessions.findActiveByTokenHash("session-sha256", now);
          expect(Option.getOrThrow(active).session.id).toBe(sessionId);
          expect(yield* sessions.revokeByTokenHash("session-sha256", now)).toBe(true);
          expect(yield* sessions.revokeByTokenHash("session-sha256", now)).toBe(false);
          expect(Option.isNone(yield* sessions.findActiveByTokenHash("session-sha256", now))).toBe(
            true,
          );

          const purged = yield* sessions.purgeExpired(addMilliseconds(now, 1));
          expect(purged.handoffs).toBe(1);
          expect(purged.sessions).toBe(1);
        }),
      );
    },
    testTimeout,
  );

  it(
    "persists project-scoped panel annotations and complete incident details",
    async () => {
      await runtime.runPromise(
        Effect.gen(function* () {
          const handoffs = yield* AuthHandoffRepository;
          const projects = yield* ProjectRepository;
          const dashboards = yield* DashboardRepository;
          const alerts = yield* AlertRepository;
          const incidents = yield* IncidentRepository;
          const deploys = yield* DeployEventRepository;
          const outbox = yield* OutboxRepository;
          const now = yield* DateTime.now;
          const sessionId = Schema.decodeUnknownSync(SessionId)(
            "0198f1a2-3b4c-7def-b456-789abcdef012",
          );

          yield* handoffs.issue({
            codeHash: "project-owner-handoff",
            hostedSubject: HostedSubject.make("owner@example.com"),
            email: EmailAddress.make("owner@example.com"),
            displayName: DisplayName.make("Project owner"),
            returnPath: "/",
            createdAt: now,
            expiresAt: addMilliseconds(now, 60_000),
          });
          const owner = Option.getOrThrow(
            yield* handoffs.redeem({
              codeHash: "project-owner-handoff",
              redeemedAt: now,
              sessionId,
              tokenHash: "project-owner-session",
              sessionExpiresAt: addMilliseconds(now, 3_600_000),
            }),
          ).account;
          const project = yield* projects.create({
            ownerId: owner.id,
            slug: ProjectSlug.make("checkout"),
            name: ProjectName.make("Checkout"),
            mode: "hosted",
            retentionDays: 7,
            quotas: {
              maxIngestBytesPerMinute: 50_000_000,
              maxActiveSeries: 100_000,
              maxPanels: 100,
            },
          });
          expect(Option.getOrThrow(yield* projects.getQuotas(project.id))).toEqual({
            maxIngestBytesPerMinute: 50_000_000,
            maxActiveSeries: 100_000,
            maxPanels: 100,
          });
          const seedInput = {
            name: DashboardName.make("Service overview"),
            description: NonEmptyText.make("Automatically discovered services"),
            isDefault: true,
            panels: [
              {
                title: PanelTitle.make(String(RequestsVsUsersPanel.title)),
                spec: RequestsVsUsersPanel,
                position: 0,
              },
            ],
          };
          const seeded = yield* Effect.all(
            [
              dashboards.seedIfEmpty(project.id, seedInput),
              dashboards.seedIfEmpty(project.id, seedInput),
            ],
            { concurrency: "unbounded" },
          );
          expect(seeded.filter(Option.isSome)).toHaveLength(1);
          expect((yield* dashboards.list(project.id))[0]?.panels).toHaveLength(1);
          const dashboard = yield* dashboards.create(project.id, {
            name: DashboardName.make("Operations"),
            description: null,
            isDefault: true,
          });
          const panel = yield* dashboards.addPanel(project.id, {
            dashboardId: dashboard.metadata.id,
            title: PanelTitle.make(String(RequestsVsUsersPanel.title)),
            spec: RequestsVsUsersPanel,
            position: 0,
          });
          const annotated = Option.getOrThrow(
            yield* dashboards.annotatePanel(
              project.id,
              panel.metadata.id,
              new PanelNoteAnnotation({
                at: now,
                label: NonEmptyText.make("Requests rose without new users"),
              }),
            ),
          );
          expect(annotated.metadata.revision).toBe(1);
          expect(annotated.annotations[0]?._tag).toBe("note");

          const reloaded = Option.getOrThrow(
            yield* dashboards.findById(project.id, dashboard.metadata.id),
          );
          expect(reloaded.panels[0]?.annotations[0]).toBeInstanceOf(PanelNoteAnnotation);
          expect(reloaded.panels[0]?.metadata.revision).toBe(1);

          const insertedFirst = yield* dashboards.addPanel(project.id, {
            dashboardId: dashboard.metadata.id,
            title: PanelTitle.make("Retry volume"),
            spec: RequestsVsUsersPanel,
            position: 0,
          });
          const afterInsert = Option.getOrThrow(
            yield* dashboards.findById(project.id, dashboard.metadata.id),
          );
          expect(afterInsert.panels.map(({ metadata }) => metadata.position)).toEqual([0, 1]);
          expect(afterInsert.panels.map(({ metadata }) => metadata.id)).toEqual([
            insertedFirst.metadata.id,
            panel.metadata.id,
          ]);
          const shiftedOriginal = afterInsert.panels[1]!;
          expect(shiftedOriginal.metadata.revision).toBe(2);

          const movedOriginal = Option.getOrThrow(
            yield* dashboards.updatePanel(project.id, panel.metadata.id, {
              title: panel.metadata.title,
              spec: panel.spec,
              position: 0,
              expectedRevision: shiftedOriginal.metadata.revision,
            }),
          );
          expect(movedOriginal.metadata.position).toBe(0);
          expect(movedOriginal.metadata.revision).toBe(3);
          const afterMove = Option.getOrThrow(
            yield* dashboards.findById(project.id, dashboard.metadata.id),
          );
          expect(afterMove.panels.map(({ metadata }) => metadata.position)).toEqual([0, 1]);
          expect(afterMove.panels[1]?.metadata.id).toBe(insertedFirst.metadata.id);
          expect(afterMove.panels[1]?.metadata.revision).toBe(1);

          expect(yield* dashboards.removePanel(project.id, panel.metadata.id)).toBe(true);
          const afterRemove = Option.getOrThrow(
            yield* dashboards.findById(project.id, dashboard.metadata.id),
          );
          expect(afterRemove.panels.map(({ metadata }) => metadata.position)).toEqual([0]);
          expect(afterRemove.panels[0]?.metadata.id).toBe(insertedFirst.metadata.id);
          expect(afterRemove.panels[0]?.metadata.revision).toBe(2);

          const alert = yield* alerts.create(project.id, {
            name: AlertName.make("Checkout latency"),
            serviceName: ServiceName.make("checkout-api"),
            metricName: "http.server.duration",
            aggregation: "p95",
            comparison: "above",
            threshold: 500,
            windowSeconds: 300,
            severity: "critical",
            summary: null,
            enabled: true,
          });
          const unrelatedProjectId = Schema.decodeUnknownSync(ProjectId)(
            "0198f1a2-3b4c-7def-8567-89abcdef0123",
          );
          const alertUpdatedAt = addMilliseconds(now, 1_000);
          expect(
            Option.isNone(
              yield* alerts.updateState(unrelatedProjectId, alert.id, {
                status: "firing",
                summary: null,
                firingSince: now,
                resolvedAt: null,
                updatedAt: alertUpdatedAt,
              }),
            ),
          ).toBe(true);
          const firingAlert = Option.getOrThrow(
            yield* alerts.updateState(project.id, alert.id, {
              status: "firing",
              summary: NonEmptyText.make("Checkout latency is above 500 ms"),
              firingSince: now,
              resolvedAt: null,
              updatedAt: alertUpdatedAt,
            }),
          );
          expect(firingAlert.status).toBe("firing");
          expect(firingAlert.summary).toBe("Checkout latency is above 500 ms");
          expect(DateTime.toEpochMillis(firingAlert.updatedAt)).toBe(
            DateTime.toEpochMillis(alertUpdatedAt),
          );
          const alertEvents = (yield* outbox.listAfter(project.id, 0n, 500)).filter(
            ({ kind }) => kind === "alert.state_changed",
          );
          expect(alertEvents).toHaveLength(1);
          expect(alertEvents[0]?.payload).toMatchObject({
            alertId: alert.id,
            status: "firing",
          });
          const alertEvent = alertEvents[0]!;
          expect(Option.getOrThrow(yield* outbox.find(project.id, alertEvent.sequence))).toEqual(
            alertEvent,
          );
          expect(Option.getOrThrow(yield* outbox.latest(project.id)).sequence).toBe(
            alertEvent.sequence,
          );
          expect(Option.isNone(yield* outbox.find(unrelatedProjectId, alertEvent.sequence))).toBe(
            true,
          );
          expect(Option.isNone(yield* outbox.latest(unrelatedProjectId))).toBe(true);

          const incident = yield* incidents.open(project.id, {
            title: IncidentTitle.make("Checkout retry storm"),
          });
          const hypothesis = Option.getOrThrow(
            yield* incidents.upsertHypothesis(project.id, incident.id, {
              id: null,
              text: NonEmptyText.make("Traffic increased"),
              status: "proposed",
            }),
          );
          yield* incidents.addNote(
            project.id,
            incident.id,
            NonEmptyText.make("Unique users are flat"),
          );
          const detail = Option.getOrThrow(yield* incidents.getDetail(project.id, incident.id));
          expect(detail.incident.id).toBe(incident.id);
          expect(detail.hypotheses.map(({ id }) => id)).toEqual([hypothesis.id]);
          expect(detail.timeline.map(({ _tag }) => _tag)).toEqual([
            "incident-status",
            "hypothesis",
            "note",
          ]);

          yield* deploys.record(project.id, {
            serviceName: ServiceName.make("checkout-api"),
            sha: Sha.make("aaaaaaa"),
            description: null,
            url: null,
            deployedAt: now,
          });
          yield* deploys.record(project.id, {
            serviceName: ServiceName.make("checkout-api"),
            sha: Sha.make("bbbbbbb"),
            description: null,
            url: null,
            deployedAt: now,
          });
          yield* deploys.record(project.id, {
            serviceName: ServiceName.make("worker"),
            sha: Sha.make("ccccccc"),
            description: null,
            url: null,
            deployedAt: now,
          });
          const firstDeployPage = yield* deploys.list(project.id, {
            since: addMilliseconds(now, -1_000),
            serviceName: ServiceName.make("checkout-api"),
            limit: 1,
          });
          expect(firstDeployPage.events).toHaveLength(1);
          expect(firstDeployPage.hasMore).toBe(true);
          expect(firstDeployPage.nextCursor).not.toBe(null);
          const secondDeployPage = yield* deploys.list(project.id, {
            since: addMilliseconds(now, -1_000),
            serviceName: ServiceName.make("checkout-api"),
            before: firstDeployPage.nextCursor ?? undefined,
            limit: 1,
          });
          expect(secondDeployPage.events).toHaveLength(1);
          expect(secondDeployPage.events[0]?.id).not.toBe(firstDeployPage.events[0]?.id);
          expect(secondDeployPage.hasMore).toBe(false);

          expect(Option.isNone(yield* incidents.getDetail(unrelatedProjectId, incident.id))).toBe(
            true,
          );
          expect(
            Option.isNone(yield* dashboards.findById(unrelatedProjectId, dashboard.metadata.id)),
          ).toBe(true);
          const otherOwnerId = Schema.decodeUnknownSync(UserId)(
            "0198f1a2-3b4c-7def-9678-9abcdef01234",
          );
          expect(Option.isNone(yield* projects.requestDeletion(otherOwnerId, project.id))).toBe(
            true,
          );
          expect(Option.isSome(yield* projects.requestDeletion(owner.id, project.id))).toBe(true);
        }),
      );
    },
    testTimeout,
  );
});
