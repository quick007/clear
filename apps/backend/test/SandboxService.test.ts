import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  AbsoluteTimeRange,
  AttributeFilter,
  AttributeKey,
  LogSearch,
  MetricName,
  MetricQuery,
  TelemetryUnavailable,
  TraceSearch,
} from "@groundtruth/telemetry";
import {
  EntityNotFound,
  NonEmptyText,
  ProjectId,
  QuotaExceeded,
  SandboxSession,
  SessionId,
} from "@groundtruth/domain";
import { Context, DateTime, Effect, Layer, Redacted, Ref, Schema } from "effect";
import { TestClock } from "effect/testing";
import { BoardService } from "../src/board/BoardService.js";
import { BackendConfig } from "../src/config/BackendConfig.js";
import { DeployService } from "../src/deploys/DeployService.js";
import { IncidentService } from "../src/incidents/IncidentService.js";
import { IncidentState } from "../src/incidents/IncidentState.js";
import { LiveEventBus } from "../src/live/LiveEventBus.js";
import {
  isSandboxProjectId,
  sandboxProjectId,
  sandboxProjectIdForSession,
} from "../src/memory/SeedIds.js";
import { sandboxMinimumIdleBeforeEvictionMilliseconds } from "../src/sandbox/SandboxCapacityPolicy.js";
import { SandboxService } from "../src/sandbox/SandboxService.js";
import { TelemetryStore } from "../src/telemetry/TelemetryStore.js";

const FoundationTest = Layer.mergeAll(IncidentState.layer, LiveEventBus.layer, NodeCrypto.layer);
const BoardTest = BoardService.layerMemory.pipe(Layer.provide(FoundationTest));
const IncidentTest = IncidentService.layer.pipe(Layer.provide(FoundationTest));
const TelemetryTest = TelemetryStore.layerMemory;
const DeployDependencies = Layer.mergeAll(FoundationTest, BoardTest);
const DeployTest = DeployService.layer.pipe(Layer.provide(DeployDependencies));
const SandboxDependencies = Layer.mergeAll(
  FoundationTest,
  BoardTest,
  IncidentTest,
  TelemetryTest,
  DeployTest,
);
const sandboxConfig = (sandboxSessionLimit: number) =>
  Layer.succeed(
    BackendConfig,
    BackendConfig.of({
      environment: "test",
      port: 3000,
      publicUrl: "http://localhost:3000",
      consoleOrigin: "http://localhost:5173",
      developmentConsoleOrigin: undefined,
      collectorSecret: Redacted.make("collector-secret"),
      siteHandoffSecret: Redacted.make("sites-secret"),
      sessionSecret: Redacted.make("session-secret"),
      cookieSecure: false,
      bootstrapProjectSlug: "local",
      bootstrapProjectName: "Local project",
      bootstrapIngestKey: undefined,
      publicStatusEnabled: false,
      sandboxSessionLimit,
      sandboxCreationsPerMinute: 10,
      authenticatedRequestsPerMinute: 300,
      publicRequestsPerMinute: 10_000,
    }),
  );
const ConfigTest = sandboxConfig(100);
const oneMinuteMilliseconds = 60 * 1_000; // 1 minute
const SandboxTest = SandboxService.layer.pipe(Layer.provide([SandboxDependencies, ConfigTest]));
const TestLayer = Layer.mergeAll(SandboxDependencies, ConfigTest, SandboxTest);
const CapacityConfigTest = sandboxConfig(2);
const CapacitySandboxTest = SandboxService.layer.pipe(
  Layer.provide([SandboxDependencies, CapacityConfigTest]),
);
const CapacityTestLayer = Layer.mergeAll(
  SandboxDependencies,
  CapacityConfigTest,
  CapacitySandboxTest,
);
const TelemetryFailFirstReplace = Layer.effect(
  TelemetryStore,
  Effect.gen(function* () {
    const memoryContext = yield* Layer.build(TelemetryStore.layerMemory);
    const memory = Context.get(memoryContext, TelemetryStore);
    const firstReplace = yield* Ref.make(true);
    return TelemetryStore.of({
      ...memory,
      replace: (projectId, batches) =>
        Effect.gen(function* () {
          const shouldFail = yield* Ref.modify(firstReplace, (first) => [first, false]);
          if (shouldFail) {
            return yield* new TelemetryUnavailable({
              operation: "test replace",
              retryable: true,
              message: "Temporary sandbox telemetry failure",
            });
          }
          yield* memory.replace(projectId, batches);
        }),
    });
  }),
);
const FailingSandboxDependencies = Layer.mergeAll(
  FoundationTest,
  BoardTest,
  IncidentTest,
  TelemetryFailFirstReplace,
  DeployTest,
);
const FailingSandboxTest = SandboxService.layer.pipe(
  Layer.provide([FailingSandboxDependencies, ConfigTest]),
);
const FailingTestLayer = Layer.mergeAll(FailingSandboxDependencies, ConfigTest, FailingSandboxTest);

describe("SandboxService", () => {
  it.effect("prunes expired sessions before enforcing concurrent sandbox capacity", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("20 minutes");
      const sandbox = yield* SandboxService;
      const telemetry = yield* TelemetryStore;
      const expiring = yield* sandbox.open(501);
      const now = yield* DateTime.now;
      const survivor = new SandboxSession({
        id: SessionId.make("01993f71-0001-7000-8000-000000000050"),
        seed: 502,
        createdAt: now,
        expiresAt: DateTime.addDuration(now, "3 hours"),
      });
      yield* sandbox.ensure(survivor);

      const full = yield* Effect.flip(sandbox.open(503));
      assert(full instanceof QuotaExceeded);
      assert.strictEqual(full.quota, "concurrent sandbox sessions");
      assert.strictEqual(full.limit, 2);
      assert.strictEqual(full.observed, 3);

      yield* TestClock.adjust("2 hours");
      const replacement = yield* sandbox.open(504);
      assert.strictEqual(replacement.phase, "baseline");
      assert.strictEqual(
        (yield* telemetry.listMetrics(sandboxProjectIdForSession(expiring.session.id))).length,
        0,
      );
      assert.strictEqual((yield* sandbox.resume(survivor.id)).session.id, survivor.id);
    }).pipe(Effect.provide(CapacityTestLayer)),
  );

  it.effect("evicts the least recently used idle session while preserving recent activity", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("20 minutes");
      const sandbox = yield* SandboxService;
      const telemetry = yield* TelemetryStore;
      const oldest = yield* sandbox.open(601);
      yield* TestClock.adjust(sandboxMinimumIdleBeforeEvictionMilliseconds - oneMinuteMilliseconds);
      const newer = yield* sandbox.open(602);
      yield* TestClock.adjust("2 minutes");

      yield* sandbox.resume(oldest.session.id);
      yield* TestClock.adjust(sandboxMinimumIdleBeforeEvictionMilliseconds - oneMinuteMilliseconds);
      const replacement = yield* sandbox.open(603);

      assert.strictEqual(replacement.phase, "baseline");
      assert.strictEqual((yield* sandbox.resume(oldest.session.id)).session.id, oldest.session.id);
      assert((yield* Effect.flip(sandbox.resume(newer.session.id))) instanceof EntityNotFound);
      assert.strictEqual(
        (yield* telemetry.listMetrics(sandboxProjectIdForSession(newer.session.id))).length,
        0,
      );
    }).pipe(Effect.provide(CapacityTestLayer)),
  );

  it.effect("retries initialization after a temporary telemetry failure", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("20 minutes");
      const sandbox = yield* SandboxService;
      const telemetry = yield* TelemetryStore;
      const now = yield* DateTime.now;
      const session = new SandboxSession({
        id: SessionId.make("01993f71-0001-7000-8000-000000000030"),
        seed: 730,
        createdAt: now,
        expiresAt: DateTime.addDuration(now, "2 hours"),
      });

      const firstError = yield* Effect.flip(sandbox.ensure(session));
      assert(firstError instanceof TelemetryUnavailable);
      const retried = yield* sandbox.ensure(session);
      assert.strictEqual(retried.changed, true);
      assert.strictEqual(retried.phase, "baseline");
      const catalog = yield* telemetry.listMetrics(sandboxProjectIdForSession(session.id));
      assert(catalog.some((metric) => metric.name === "http.server.requests"));
    }).pipe(Effect.provide(FailingTestLayer)),
  );

  it.effect("preserves the exact client session and seeds isolated baseline data", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("20 minutes");
      const sandbox = yield* SandboxService;
      const boards = yield* BoardService;
      const incidents = yield* IncidentService;
      const telemetry = yield* TelemetryStore;
      const now = yield* DateTime.now;
      const session = new SandboxSession({
        id: SessionId.make("01993f71-0001-7000-8000-000000000031"),
        seed: 731,
        createdAt: now,
        expiresAt: DateTime.addDuration(now, "2 hours"),
      });

      const created = yield* sandbox.ensure(session);
      const resumed = yield* sandbox.ensure(
        new SandboxSession({
          id: session.id,
          seed: 999,
          createdAt: session.createdAt,
          expiresAt: DateTime.addDuration(now, "12 hours"),
        }),
      );
      assert.strictEqual(created.session.id, session.id);
      assert.strictEqual(created.changed, true);
      assert.strictEqual(resumed.changed, false);
      assert.strictEqual(resumed.session.seed, 731);
      assert.strictEqual(resumed.session.expiresAt, session.expiresAt);

      const projectId = sandboxProjectIdForSession(session.id);
      assert.notStrictEqual(String(projectId), String(session.id));
      assert.strictEqual(projectId, sandboxProjectIdForSession(session.id));
      assert.strictEqual(isSandboxProjectId(projectId), true);
      assert.strictEqual(isSandboxProjectId(sandboxProjectId), true);
      assert.strictEqual(Schema.decodeUnknownSync(ProjectId)(projectId), projectId);
      const board = yield* boards.getDefaultBoard(projectId);
      assert.strictEqual(board.panels.length, 2);
      assert.deepStrictEqual(
        board.panels.map(({ spec }) => spec.title),
        ["Payment request rate", "Checkout latency"],
      );
      assert.strictEqual(
        board.panels.some(({ spec }) => spec.title === "Upstream requests vs unique users"),
        false,
      );
      assert.strictEqual(
        board.panels.some(({ spec }) => spec.title === "Upstream requests by attempt"),
        false,
      );
      const alerts = yield* incidents.listAlerts(projectId, {});
      assert.strictEqual(alerts.length, 1);
      assert.strictEqual(alerts[0]?.status, "healthy");
      assert.strictEqual(alerts[0]?.metricName, "upstream.client.requests");
      assert.strictEqual(alerts[0]?.name, "Checkout upstream request rate");
      assert.strictEqual(alerts[0]?.comparison, "at-or-above");
      assert.strictEqual(alerts[0]?.windowSeconds, 5);
      const paymentPanel = board.panels.find(({ spec }) => spec.title === "Payment request rate");
      assert(paymentPanel?.spec._tag === "metric-chart");
      assert.strictEqual(paymentPanel.spec.thresholds?.[0]?.value, alerts[0]?.threshold);
      const catalog = yield* telemetry.listMetrics(projectId);
      assert(catalog.some((metric) => metric.name === "http.server.requests"));
      const services = yield* telemetry.listServices(projectId);
      assert(services.some((service) => service.name === "checkout-api"));
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("drives amplification and reset without simulating a fix", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("20 minutes");
      const sandbox = yield* SandboxService;
      const boards = yield* BoardService;
      const deploys = yield* DeployService;
      const incidents = yield* IncidentService;
      const telemetry = yield* TelemetryStore;
      const initial = yield* sandbox.open(42);
      const projectId = sandboxProjectIdForSession(initial.session.id);
      const now = yield* DateTime.now;

      const triggered = yield* sandbox.trigger(initial.session.id);
      assert.strictEqual(triggered.phase, "upstream-blip");
      assert.strictEqual(triggered.changed, true);
      const repeatedTrigger = yield* sandbox.trigger(initial.session.id);
      assert.strictEqual(repeatedTrigger.changed, false);
      const openedIncident = yield* incidents.getOpenIncident(projectId);
      assert(openedIncident !== null);
      assert.strictEqual(openedIncident.status, "open");
      assert.strictEqual(openedIncident.title, "Checkout reliability investigation");
      assert.strictEqual(/retry|amplification/i.test(String(openedIncident.title)), false);
      assert.strictEqual((yield* incidents.listAlerts(projectId, { status: "firing" })).length, 0);

      for (let tick = 0; tick < 4; tick += 1) {
        yield* TestClock.adjust("5 seconds");
        assert.strictEqual(yield* sandbox.advanceActive(), 1);
      }
      const beforeThreshold = yield* sandbox.resume(initial.session.id);
      assert.strictEqual(beforeThreshold.phase, "amplification");
      assert.strictEqual((yield* incidents.listAlerts(projectId, { status: "firing" })).length, 0);

      yield* TestClock.adjust("5 seconds");
      assert.strictEqual(yield* sandbox.advanceActive(), 1);
      const thresholdAlerts = yield* incidents.listAlerts(projectId, { status: "firing" });
      assert.strictEqual(thresholdAlerts.length, 1);
      const prematureClose = yield* Effect.flip(
        incidents.close(
          projectId,
          openedIncident.id,
          NonEmptyText.make("The investigation is not actually recovered"),
        ),
      );
      assert.strictEqual(prematureClose._tag, "InvalidStateTransition");
      assert.match(String(thresholdAlerts[0]?.summary), /9\d\.\d requests per second/);
      const thresholdDetail = yield* incidents.getDetail(projectId, openedIncident.id);
      assert.strictEqual(thresholdDetail.timeline.length, 3);
      assert.deepStrictEqual(
        thresholdDetail.timeline
          .slice(0, 2)
          .map((entry) => (entry._tag === "note" ? String(entry.text) : entry._tag)),
        ["Payment failures began in payments-stub.", "Checkout p95 crossed 600 ms."],
      );
      const alertTimelineEntry = thresholdDetail.timeline.at(-1);
      assert(alertTimelineEntry?._tag === "note");
      assert.match(
        String(alertTimelineEntry.text),
        /Payment attempts reached 9\d\.\d requests per second\./,
      );

      for (let tick = 0; tick < 7; tick += 1) {
        yield* TestClock.adjust("5 seconds");
        assert.strictEqual(yield* sandbox.advanceActive(), 1);
      }
      const amplified = yield* sandbox.resume(initial.session.id);
      assert.strictEqual(amplified.phase, "amplification");
      const firingAlerts = yield* incidents.listAlerts(projectId, { status: "firing" });
      assert.strictEqual(firingAlerts.length, 1);

      const baselineRange = new AbsoluteTimeRange({
        start: DateTime.subtractDuration(now, "30 seconds"),
        end: now,
      });
      const incidentNow = yield* DateTime.now;
      const amplificationRange = new AbsoluteTimeRange({
        start: DateTime.subtractDuration(incidentNow, "30 seconds"),
        end: incidentNow,
      });
      const upstreamRequests = (range: AbsoluteTimeRange) =>
        telemetry.queryMetrics(
          projectId,
          new MetricQuery({
            metric: MetricName.make("upstream.client.requests"),
            aggregation: "rate",
            range,
            step: "30s",
          }),
        );
      const users = (range: AbsoluteTimeRange) =>
        telemetry.queryMetrics(
          projectId,
          new MetricQuery({
            metric: MetricName.make("http.server.requests"),
            aggregation: "count-distinct",
            distinctKey: AttributeKey.make("user.id"),
            range,
            step: "30s",
          }),
        );
      const retryRequests = yield* telemetry.queryMetrics(
        projectId,
        new MetricQuery({
          metric: MetricName.make("upstream.client.requests"),
          aggregation: "rate",
          range: amplificationRange,
          step: "30s",
          filters: [
            new AttributeFilter({
              key: AttributeKey.make("retry"),
              operator: "equals",
              value: "true",
            }),
          ],
        }),
      );
      const baselineRequests = yield* upstreamRequests(baselineRange);
      const amplifiedRequests = yield* upstreamRequests(amplificationRange);
      const baselineUsers = yield* users(baselineRange);
      const amplifiedUsers = yield* users(amplificationRange);
      const requestRatio =
        (amplifiedRequests.stats.average ?? 0) / (baselineRequests.stats.average ?? 1);
      const userRatio = (amplifiedUsers.stats.average ?? 0) / (baselineUsers.stats.average ?? 1);
      const retryShare =
        (retryRequests.stats.average ?? 0) / (amplifiedRequests.stats.average ?? 1);
      assert(requestRatio > 2.5, JSON.stringify({ requestRatio, userRatio, retryShare }));
      assert(userRatio > 0.9 && userRatio < 1.1);
      assert(retryShare > 0.55);

      const recovery = yield* sandbox.recover(initial.session.id);
      assert.strictEqual(recovery.phase, "recovery");
      assert.strictEqual(recovery.changed, true);
      assert.strictEqual((yield* sandbox.recover(initial.session.id)).changed, false);
      assert.strictEqual((yield* deploys.list(projectId, {})).events.length, 1);
      const deployedBoard = yield* boards.getDefaultBoard(projectId);
      assert(deployedBoard.panels.every((panel) => panel.annotations.length === 1));

      for (let tick = 0; tick < 12; tick += 1) {
        yield* TestClock.adjust("5 seconds");
        assert.strictEqual(yield* sandbox.advanceActive(), 1);
      }
      assert.strictEqual((yield* incidents.listAlerts(projectId, { status: "firing" })).length, 0);
      assert.strictEqual(
        (yield* incidents.listAlerts(projectId, { status: "resolved" })).length,
        1,
      );
      const recoveredDetail = yield* incidents.getDetail(projectId, openedIncident.id);
      assert.match(
        String(recoveredDetail.timeline.findLast((entry) => entry._tag === "note")?.text ?? ""),
        /Payment attempts returned to \d+\.\d requests per second\./,
      );
      const closed = yield* incidents.close(
        projectId,
        openedIncident.id,
        NonEmptyText.make("Bounded retries restored normal payment request volume"),
      );
      assert.strictEqual(closed.incident.status, "closed");

      const reset = yield* sandbox.reset(initial.session.id);
      assert.strictEqual(reset.phase, "baseline");
      assert.strictEqual(reset.session.id, initial.session.id);
      assert.strictEqual(yield* incidents.getOpenIncident(projectId), null);
      assert.strictEqual((yield* deploys.list(projectId, {})).events.length, 0);
      assert((yield* telemetry.listMetrics(projectId)).length > 0);
      const resetBoard = yield* boards.getDefaultBoard(projectId);
      assert.strictEqual(resetBoard.panels.length, 2);
      assert(resetBoard.panels.every((panel) => panel.annotations.length === 0));
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("appends fresh telemetry without crossing sandbox sessions", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("20 minutes");
      const sandbox = yield* SandboxService;
      const telemetry = yield* TelemetryStore;
      const first = yield* sandbox.open(811);
      const second = yield* sandbox.open(812);
      const firstProjectId = sandboxProjectIdForSession(first.session.id);
      const secondProjectId = sandboxProjectIdForSession(second.session.id);

      const recentUpstreamValues = (projectId: ProjectId) =>
        Effect.gen(function* () {
          const now = yield* DateTime.now;
          const result = yield* telemetry.queryMetrics(
            projectId,
            new MetricQuery({
              metric: MetricName.make("upstream.client.requests"),
              aggregation: "rate",
              range: new AbsoluteTimeRange({
                start: DateTime.subtractDuration(now, "1 minute"),
                end: now,
              }),
              step: "30s",
            }),
          );
          return result.series.flatMap(({ points }) => points.map(({ value }) => value));
        });
      const latestSeenAt = (projectId: ProjectId) =>
        telemetry.listServices(projectId).pipe(
          Effect.flatMap((services) => {
            const checkout = services.find(({ name }) => name === "checkout-api");
            return checkout === undefined
              ? Effect.die("Expected checkout-api sandbox telemetry")
              : Effect.succeed(DateTime.toEpochMillis(checkout.lastSeenAt));
          }),
        );

      const initialValues = yield* recentUpstreamValues(firstProjectId);
      const firstInitialSeenAt = yield* latestSeenAt(firstProjectId);
      const secondInitialSeenAt = yield* latestSeenAt(secondProjectId);
      assert(initialValues.length > 0);
      assert.strictEqual(firstInitialSeenAt, secondInitialSeenAt);

      yield* TestClock.adjust("2 minutes");
      yield* TestClock.adjust("1 second");
      yield* sandbox.resume(first.session.id);
      yield* TestClock.adjust("5 seconds");
      const now = yield* DateTime.now;
      assert.strictEqual(yield* sandbox.advanceActive(), 1);

      const firstRefreshedSeenAt = yield* latestSeenAt(firstProjectId);
      const secondUnchangedSeenAt = yield* latestSeenAt(secondProjectId);
      const refreshedValues = yield* recentUpstreamValues(firstProjectId);
      const currentRange = new AbsoluteTimeRange({
        start: DateTime.subtractDuration(now, "1 minute"),
        end: now,
      });
      const recentLogs = yield* telemetry.searchLogs(
        firstProjectId,
        new LogSearch({ range: currentRange, limit: 20 }),
      );
      const recentTraces = yield* telemetry.searchTraces(
        firstProjectId,
        new TraceSearch({ range: currentRange, limit: 20 }),
      );
      assert.notStrictEqual(JSON.stringify(refreshedValues), JSON.stringify(initialValues));
      assert(recentLogs.records.length > 0);
      assert(recentTraces.traces.length > 0);
      assert(firstRefreshedSeenAt > firstInitialSeenAt);
      assert(firstRefreshedSeenAt <= DateTime.toEpochMillis(now));
      assert(DateTime.toEpochMillis(now) - firstRefreshedSeenAt < 10 * 1_000);
      assert.strictEqual(secondUnchangedSeenAt, secondInitialSeenAt);

      yield* sandbox.resume(second.session.id);
      assert.strictEqual(yield* latestSeenAt(secondProjectId), secondInitialSeenAt);
      yield* TestClock.adjust("5 seconds");
      assert.strictEqual(yield* sandbox.advanceActive(), 2);
      assert.strictEqual(yield* latestSeenAt(secondProjectId), yield* latestSeenAt(firstProjectId));
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("resolves the fake incident and normalizes retry traffic in one action", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("20 minutes");
      const sandbox = yield* SandboxService;
      const incidents = yield* IncidentService;
      const opened = yield* sandbox.open(913);
      const projectId = sandboxProjectIdForSession(opened.session.id);

      yield* sandbox.trigger(opened.session.id);
      for (let tick = 0; tick < 5; tick += 1) {
        yield* TestClock.adjust("5 seconds");
        yield* sandbox.advanceActive();
      }
      assert.strictEqual((yield* incidents.listAlerts(projectId, { status: "firing" })).length, 1);

      const resolved = yield* sandbox.resolve(opened.session.id);

      assert.strictEqual(resolved.phase, "recovery");
      assert.strictEqual((yield* incidents.listAlerts(projectId, { status: "firing" })).length, 0);
      assert.strictEqual(
        (yield* incidents.listAlerts(projectId, { status: "resolved" })).length,
        1,
      );
      assert.strictEqual(yield* incidents.getOpenIncident(projectId), null);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("advances recently active sandboxes on the backend clock", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("20 minutes");
      const sandbox = yield* SandboxService;
      const telemetry = yield* TelemetryStore;
      const first = yield* sandbox.open(901);
      const second = yield* sandbox.open(902);
      const firstProjectId = sandboxProjectIdForSession(first.session.id);
      const secondProjectId = sandboxProjectIdForSession(second.session.id);
      const latestSeenAt = (projectId: ProjectId) =>
        telemetry.listServices(projectId).pipe(
          Effect.flatMap((services) => {
            const checkout = services.find(({ name }) => name === "checkout-api");
            return checkout === undefined
              ? Effect.die("Expected checkout-api sandbox telemetry")
              : Effect.succeed(DateTime.toEpochMillis(checkout.lastSeenAt));
          }),
        );
      const initial = yield* latestSeenAt(firstProjectId);

      yield* TestClock.adjust("5 seconds");
      assert.strictEqual(yield* sandbox.advanceActive(), 2);
      const firstAdvanced = yield* latestSeenAt(firstProjectId);
      const secondAdvanced = yield* latestSeenAt(secondProjectId);
      assert(firstAdvanced > initial);
      assert.strictEqual(firstAdvanced, secondAdvanced);
      assert.strictEqual(yield* sandbox.advanceActive(), 0);

      yield* TestClock.adjust("2 minutes");
      yield* TestClock.adjust("1 second");
      assert.strictEqual(yield* sandbox.advanceActive(), 0);
      assert.strictEqual(yield* latestSeenAt(firstProjectId), firstAdvanced);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("expires and purges sessions after two hours", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("20 minutes");
      const sandbox = yield* SandboxService;
      const boards = yield* BoardService;
      const telemetry = yield* TelemetryStore;
      const created = yield* sandbox.open(108);
      const now = yield* DateTime.now;
      const survivor = new SandboxSession({
        id: SessionId.make("01993f71-0001-7000-8000-000000000041"),
        seed: 109,
        createdAt: now,
        expiresAt: DateTime.addDuration(now, "3 hours"),
      });
      yield* sandbox.ensure(survivor);

      const unknown = SessionId.make("01993f71-0001-7000-8000-000000000042");
      assert((yield* Effect.flip(sandbox.resume(unknown))) instanceof EntityNotFound);
      const survivorProjectId = sandboxProjectIdForSession(survivor.id);
      assert.strictEqual((yield* boards.getDefaultBoard(survivorProjectId)).panels.length, 2);
      assert((yield* telemetry.listMetrics(survivorProjectId)).length > 0);

      yield* TestClock.adjust("2 hours");

      assert.strictEqual(yield* sandbox.pruneExpired(), 1);
      const missing = yield* Effect.flip(sandbox.resume(created.session.id));
      assert(missing instanceof EntityNotFound);
      assert.strictEqual((yield* sandbox.resume(survivor.id)).session.id, survivor.id);
      assert((yield* telemetry.listMetrics(survivorProjectId)).length > 0);
    }).pipe(Effect.provide(TestLayer)),
  );
});
