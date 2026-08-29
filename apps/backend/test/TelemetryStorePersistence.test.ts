import { assert, describe, it } from "@effect/vitest";
import {
  DashboardName,
  EmailAddress,
  HostedSubject,
  InvalidCursor,
  NonEmptyText,
  PanelTitle,
  ProjectId,
  ProjectName,
  ProjectSlug,
  SessionId,
} from "@groundtruth/domain";
import {
  AccountRepository,
  DashboardRepository,
  ProjectRepository,
  TelemetryRepository,
} from "@groundtruth/persistence";
import { PersistenceMemory, TelemetryMemoryControl } from "@groundtruth/persistence/testing";
import { RequestsVsUsersPanel } from "@groundtruth/panel-dsl";
import {
  CanonicalTelemetryBatch,
  CollectorBatchId,
  Cursor,
  DoubleMetricValue,
  GaugePoint,
  InstrumentationScope,
  LogRecord,
  LogSearch,
  MetricName,
  OtelFlags,
  ResourceContext,
  ServiceName,
  SpanId,
  SpanRecord,
  SpanStatus,
  TelemetryUnavailable,
  TraceId,
  UnixNano,
} from "@groundtruth/telemetry";
import { Context, DateTime, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { isSandboxProjectId, sandboxProjectIdForSession } from "../src/memory/SeedIds.js";
import { discoveredServiceNames } from "../src/board/StandardServiceOverview.js";
import { TelemetryStore } from "../src/telemetry/TelemetryStore.js";

const resourceFor = (serviceName: string) =>
  new ResourceContext({
    attributes: { "service.name": serviceName },
    droppedAttributesCount: 0n,
    entityRefs: [],
    schemaUrl: null,
  });

const resource = resourceFor("checkout-api");

const scope = new InstrumentationScope({
  name: "groundtruth.test",
  version: "1.0.0",
  attributes: {},
  droppedAttributesCount: 0n,
  schemaUrl: null,
});

const observedAt = UnixNano.make(1_787_904_000_000_000_000n);

const batch = new CanonicalTelemetryBatch({
  id: CollectorBatchId.make("01993f71-0001-7000-8000-000000000061"),
  receivedAt: DateTime.fromDateUnsafe(new Date("2026-08-28T08:00:00.000Z")),
  metrics: [
    new GaugePoint({
      name: MetricName.make("service.replicas"),
      description: "Active service replicas",
      unit: "{replica}",
      metadata: {},
      resource,
      scope,
      serviceName: ServiceName.make("checkout-api"),
      startTimeUnixNano: null,
      timeUnixNano: observedAt,
      attributes: {},
      exemplars: [],
      flags: OtelFlags.make(0),
      value: new DoubleMetricValue({ value: 2 }),
    }),
  ],
  logs: [],
  spans: [],
});

const logBatch = new CanonicalTelemetryBatch({
  id: CollectorBatchId.make("01993f71-0001-7000-8000-000000000064"),
  receivedAt: batch.receivedAt,
  metrics: [],
  logs: [
    new LogRecord({
      timeUnixNano: observedAt,
      observedTimeUnixNano: observedAt,
      traceId: null,
      spanId: null,
      flags: OtelFlags.make(0),
      severity: "info",
      severityNumber: 9,
      severityText: "INFO",
      body: "worker ready",
      eventName: null,
      attributes: {},
      droppedAttributesCount: 0n,
      resource: resourceFor("audit-worker"),
      scope,
      serviceName: ServiceName.make("audit-worker"),
    }),
  ],
  spans: [],
});

const traceBatch = new CanonicalTelemetryBatch({
  id: CollectorBatchId.make("01993f71-0001-7000-8000-000000000065"),
  receivedAt: batch.receivedAt,
  metrics: [],
  logs: [],
  spans: [
    new SpanRecord({
      traceId: TraceId.make("4bf92f3577b34da6a3ce929d0e0e4736"),
      spanId: SpanId.make("00f067aa0ba902b7"),
      parentSpanId: null,
      traceState: "",
      flags: OtelFlags.make(1),
      name: "authorize payment",
      kind: "server",
      startTimeUnixNano: observedAt,
      endTimeUnixNano: UnixNano.make(observedAt + 100_000_000n),
      durationNanos: 100_000_000n,
      status: new SpanStatus({ code: "ok", message: "" }),
      attributes: {},
      droppedAttributesCount: 0n,
      events: [],
      droppedEventsCount: 0n,
      links: [],
      droppedLinksCount: 0n,
      resource: resourceFor("payments-stub"),
      scope,
      serviceName: ServiceName.make("payments-stub"),
    }),
  ],
});

const StoreTest = TelemetryStore.layerPersistence.pipe(Layer.provideMerge(PersistenceMemory));

const createHostedProject = Effect.fn("test.createHostedProject")(function* (suffix: string) {
  const accounts = yield* AccountRepository;
  const projects = yield* ProjectRepository;
  const account = yield* accounts.upsertHosted({
    hostedSubject: HostedSubject.make(`${suffix}@example.com`),
    email: EmailAddress.make(`${suffix}@example.com`),
    displayName: null,
  });
  return yield* projects.create({
    ownerId: account.id,
    slug: ProjectSlug.make(suffix),
    name: ProjectName.make(suffix),
    mode: "hosted",
    retentionDays: 11,
    quotas: {
      maxIngestBytesPerMinute: 10_000_000,
      maxActiveSeries: 10_000,
      maxPanels: 12,
    },
  });
});

describe("TelemetryStore persistence adapter", () => {
  it.effect("routes hosted telemetry to persistence and sandbox telemetry to memory", () =>
    Effect.gen(function* () {
      yield* TestClock.adjust("1 second");
      const accounts = yield* AccountRepository;
      const projects = yield* ProjectRepository;
      const dashboards = yield* DashboardRepository;
      const repository = yield* TelemetryRepository;
      const persisted = yield* TelemetryMemoryControl;
      const telemetry = yield* TelemetryStore;

      const account = yield* accounts.upsertHosted({
        hostedSubject: HostedSubject.make("operator@example.com"),
        email: EmailAddress.make("operator@example.com"),
        displayName: null,
      });
      const project = yield* projects.create({
        ownerId: account.id,
        slug: ProjectSlug.make("hosted-checkout"),
        name: ProjectName.make("Hosted checkout"),
        mode: "hosted",
        retentionDays: 11,
        quotas: {
          maxIngestBytesPerMinute: 10_000_000,
          maxActiveSeries: 10_000,
          maxPanels: 12,
        },
      });

      yield* telemetry.ingest(project.id, batch);
      yield* telemetry.ingest(project.id, logBatch);
      yield* telemetry.ingest(project.id, traceBatch);
      assert.strictEqual((yield* telemetry.listMetrics(project.id)).length, 1);
      const traceCursor = Cursor.make(
        Buffer.from(
          JSON.stringify({ _tag: "traces", startTimeUnixNano: String(observedAt), traceId: "x" }),
        ).toString("base64url"),
      );
      const cursorError = yield* Effect.flip(
        telemetry.searchLogs(project.id, new LogSearch({ cursor: traceCursor })),
      );
      assert(cursorError instanceof InvalidCursor);
      const captures = (yield* persisted.snapshot).projects.get(project.id) ?? [];
      assert.strictEqual(captures.length, 3);
      assert.strictEqual(captures[0]?.retentionDays, 11);

      const restarted = yield* Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(
            TelemetryStore.layerPersistence.pipe(
              Layer.provide([
                Layer.succeed(ProjectRepository, projects),
                Layer.succeed(TelemetryRepository, repository),
                Layer.succeed(DashboardRepository, dashboards),
              ]),
            ),
          );
          const restartedTelemetry = Context.get(context, TelemetryStore);
          return {
            services: yield* restartedTelemetry.listServices(project.id),
            health: yield* restartedTelemetry.signalHealth(project.id),
          };
        }),
      );
      assert.deepStrictEqual(
        restarted.services.map((service) => [
          service.name,
          service.signals.metrics,
          service.signals.logs,
          service.signals.traces,
        ]),
        [
          ["audit-worker", false, true, false],
          ["checkout-api", true, false, false],
          ["payments-stub", false, false, true],
        ],
      );
      assert.deepStrictEqual(
        restarted.health.map((signal) => [
          signal.signal,
          signal.services.map((service) => String(service)),
        ]),
        [
          ["metrics", ["checkout-api"]],
          ["logs", ["audit-worker"]],
          ["traces", ["payments-stub"]],
        ],
      );

      const replaceError = yield* Effect.flip(telemetry.replace(project.id, [batch]));
      assert(replaceError instanceof TelemetryUnavailable);
      assert.strictEqual(replaceError.retryable, false);

      const missingHostedProjectId = ProjectId.make("01993f71-0001-7000-8000-000000000063");
      const missingHostedError = yield* Effect.flip(
        telemetry.ingest(missingHostedProjectId, batch),
      );
      assert(missingHostedError instanceof TelemetryUnavailable);
      assert.strictEqual((yield* persisted.batches(missingHostedProjectId)).length, 0);

      const sandboxProjectId = sandboxProjectIdForSession(
        SessionId.make("01993f71-0001-7000-8000-000000000062"),
      );
      yield* telemetry.replace(sandboxProjectId, [batch]);
      assert.strictEqual((yield* telemetry.listMetrics(sandboxProjectId)).length, 1);
      assert.strictEqual((yield* persisted.batches(sandboxProjectId)).length, 0);

      yield* telemetry.clear(sandboxProjectId);
      assert.strictEqual((yield* telemetry.listMetrics(sandboxProjectId)).length, 0);
      assert.strictEqual((yield* telemetry.listMetrics(project.id)).length, 1);
    }).pipe(Effect.provide(StoreTest)),
  );

  it.effect("seeds one service overview from the first hosted telemetry", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
      const telemetry = yield* TelemetryStore;
      const dashboards = yield* DashboardRepository;
      const project = yield* createHostedProject("first-telemetry-board");
      assert.strictEqual(isSandboxProjectId(project.id), false);
      const first = new CanonicalTelemetryBatch({
        id: CollectorBatchId.make("01993f71-0001-7000-8000-000000000066"),
        receivedAt: batch.receivedAt,
        metrics: batch.metrics,
        logs: logBatch.logs,
        spans: traceBatch.spans,
      });

      assert.deepStrictEqual(discoveredServiceNames(first), [
        "audit-worker",
        "checkout-api",
        "payments-stub",
      ]);

      yield* telemetry.ingest(project.id, first);
      const seeded = yield* dashboards.list(project.id);

      assert.strictEqual(seeded.length, 1);
      assert.strictEqual(seeded[0]?.metadata.name, "Service overview");
      assert.deepStrictEqual(
        seeded[0]?.panels.map(({ spec }) => spec.title),
        ["audit-worker overview", "checkout-api overview", "payments-stub overview"],
      );
      assert.deepStrictEqual(
        seeded[0]?.panels.map(({ spec }) => {
          assert.strictEqual(spec._tag, "metric-chart");
          if (spec._tag !== "metric-chart") return undefined;
          const filter = spec.queries[0]?.filters?.[0];
          return filter?._tag === "match" ? filter.value : undefined;
        }),
        ["audit-worker", "checkout-api", "payments-stub"],
      );

      yield* telemetry.ingest(project.id, first);
      assert.deepStrictEqual(yield* dashboards.list(project.id), seeded);
    }).pipe(Effect.provide(StoreTest)),
  );

  it.effect("does not overwrite or customize an existing hosted board", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
      const telemetry = yield* TelemetryStore;
      const dashboards = yield* DashboardRepository;
      const project = yield* createHostedProject("existing-telemetry-board");
      const custom = yield* dashboards.create(project.id, {
        name: DashboardName.make("My production board"),
        description: NonEmptyText.make("Owned by the operator"),
        isDefault: true,
      });
      yield* dashboards.addPanel(project.id, {
        dashboardId: custom.metadata.id,
        title: PanelTitle.make(String(RequestsVsUsersPanel.title)),
        spec: RequestsVsUsersPanel,
        position: 0,
      });
      const before = yield* dashboards.list(project.id);

      yield* telemetry.ingest(project.id, batch);

      assert.deepStrictEqual(yield* dashboards.list(project.id), before);
    }).pipe(Effect.provide(StoreTest)),
  );
});
