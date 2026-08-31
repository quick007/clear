import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  AlertName,
  EmailAddress,
  HostedSubject,
  IncidentTitle,
  NonEmptyText,
  ProjectName,
  ProjectSlug,
  ServiceName as DomainServiceName,
} from "@groundtruth/domain";
import {
  AccountRepository,
  AlertRepository,
  IncidentRepository,
  IncidentHistoryLimits,
  ProjectRepository,
} from "@groundtruth/persistence";
import { PersistenceMemory } from "@groundtruth/persistence/testing";
import {
  CanonicalTelemetryBatch,
  CollectorBatchId,
  DoubleMetricValue,
  GaugePoint,
  InstrumentationScope,
  MetricName,
  OtelFlags,
  ResourceContext,
  ServiceName,
  UnixNano,
} from "@groundtruth/telemetry";
import { DateTime, Effect, Layer, Option } from "effect";
import { TestClock } from "effect/testing";
import { AlertEvaluator, AlertEvaluatorMaintenance } from "../src/alerts/AlertEvaluator.js";
import { IncidentService } from "../src/incidents/IncidentService.js";
import { IncidentServiceLive } from "../src/incidents/IncidentServiceLive.js";
import { IncidentState } from "../src/incidents/IncidentState.js";
import { LiveEventBus } from "../src/live/LiveEventBus.js";
import { TelemetryStore } from "../src/telemetry/TelemetryStore.js";

const DurableEventsTest = LiveEventBus.layer.pipe(Layer.provideMerge(PersistenceMemory));
const FoundationTest = Layer.mergeAll(
  DurableEventsTest,
  IncidentState.layer,
  TelemetryStore.layerMemory,
  NodeCrypto.layer,
);
const IncidentTest = Layer.merge(
  FoundationTest,
  IncidentServiceLive.pipe(Layer.provide(FoundationTest)),
);
const EvaluatorTest = Layer.merge(
  IncidentTest,
  AlertEvaluator.layer.pipe(Layer.provide(IncidentTest)),
);

const createHostedAlert = Effect.gen(function* () {
  const accounts = yield* AccountRepository;
  const projects = yield* ProjectRepository;
  const alerts = yield* AlertRepository;
  const account = yield* accounts.upsertHosted({
    hostedSubject: HostedSubject.make("alert-operator@example.com"),
    email: EmailAddress.make("alert-operator@example.com"),
    displayName: null,
  });
  const project = yield* projects.create({
    ownerId: account.id,
    slug: ProjectSlug.make("alert-checkout"),
    name: ProjectName.make("Alert checkout"),
    mode: "hosted",
    retentionDays: 14,
    quotas: {
      maxIngestBytesPerMinute: 10_000_000,
      maxActiveSeries: 10_000,
      maxPanels: 12,
    },
  });
  const alert = yield* alerts.create(project.id, {
    name: AlertName.make("Checkout latency"),
    serviceName: DomainServiceName.make("checkout-api"),
    metricName: "http.server.duration",
    aggregation: "avg",
    comparison: "above",
    threshold: 100,
    windowSeconds: 60,
    severity: "critical",
    summary: null,
    enabled: true,
  });
  return { alert, project };
});

const resource = new ResourceContext({
  attributes: { "service.name": "checkout-api" },
  droppedAttributesCount: 0n,
  entityRefs: [],
  schemaUrl: null,
});
const scope = new InstrumentationScope({
  name: "groundtruth.alert-evaluator.test",
  version: "1.0.0",
  attributes: {},
  droppedAttributesCount: 0n,
  schemaUrl: null,
});

const ingestValue = (
  projectId: Parameters<TelemetryStore["Service"]["ingest"]>[0],
  value: number,
  batchId: string,
) =>
  Effect.gen(function* () {
    const telemetry = yield* TelemetryStore;
    const now = yield* DateTime.now;
    const timeUnixNano = UnixNano.make(BigInt(DateTime.toEpochMillis(now)) * 1_000_000n);
    yield* telemetry.ingest(
      projectId,
      new CanonicalTelemetryBatch({
        id: CollectorBatchId.make(batchId),
        receivedAt: now,
        metrics: [
          new GaugePoint({
            name: MetricName.make("http.server.duration"),
            description: "Server request duration",
            unit: "ms",
            metadata: {},
            resource,
            scope,
            serviceName: ServiceName.make("checkout-api"),
            startTimeUnixNano: null,
            timeUnixNano,
            attributes: {},
            exemplars: [],
            flags: OtelFlags.make(0),
            value: new DoubleMetricValue({ value }),
          }),
        ],
        logs: [],
        spans: [],
      }),
    );
  });

describe("AlertEvaluator", () => {
  it.effect("durably fires and resolves an alert without duplicating timeline notes", () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
        const evaluator = yield* AlertEvaluator;
        const alerts = yield* AlertRepository;
        const incidents = yield* IncidentService;
        const { alert, project } = yield* createHostedAlert;
        const incident = yield* incidents.openIncident(
          project.id,
          IncidentTitle.make("Investigate checkout latency"),
        );
        yield* ingestValue(project.id, 150, "01993f71-0001-7000-8000-000000000081");

        const firingReport = yield* evaluator.evaluateProject(project.id);
        assert.strictEqual(firingReport.transitioned, 1);
        const firing = yield* alerts.findById(project.id, alert.id);
        assert(Option.isSome(firing));
        assert.strictEqual(firing.value.status, "firing");
        assert.strictEqual(
          firing.value.firingSince === null
            ? null
            : DateTime.toEpochMillis(firing.value.firingSince),
          Date.parse("2026-08-28T08:00:00.000Z"),
        );

        const initialDetail = yield* incidents.getDetail(project.id, incident.incident.id);
        assert.deepStrictEqual(
          initialDetail.timeline.map(({ _tag }) => _tag),
          ["incident-status", "note"],
        );

        const stableReport = yield* evaluator.evaluateProject(project.id);
        assert.strictEqual(stableReport.stable, 1);
        const stableDetail = yield* incidents.getDetail(project.id, incident.incident.id);
        assert.strictEqual(stableDetail.timeline.length, 2);

        yield* TestClock.adjust("61 seconds");
        yield* ingestValue(project.id, 50, "01993f71-0001-7000-8000-000000000082");
        const resolvedReport = yield* evaluator.evaluateProject(project.id);
        assert.strictEqual(resolvedReport.transitioned, 1);
        const resolved = yield* alerts.findById(project.id, alert.id);
        assert(Option.isSome(resolved));
        assert.strictEqual(resolved.value.status, "resolved");
        assert.strictEqual(
          resolved.value.firingSince === null
            ? null
            : DateTime.toEpochMillis(resolved.value.firingSince),
          Date.parse("2026-08-28T08:00:00.000Z"),
        );
        assert.strictEqual(
          resolved.value.resolvedAt === null
            ? null
            : DateTime.toEpochMillis(resolved.value.resolvedAt),
          Date.parse("2026-08-28T08:01:01.000Z"),
        );
        const resolvedDetail = yield* incidents.getDetail(project.id, incident.incident.id);
        assert.deepStrictEqual(
          resolvedDetail.timeline.map(({ _tag }) => _tag),
          ["incident-status", "note", "note"],
        );
      }).pipe(Effect.provide(EvaluatorTest)),
    ),
  );

  it.effect("keeps a committed alert transition when incident history is full", () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
        const evaluator = yield* AlertEvaluator;
        const alerts = yield* AlertRepository;
        const incidents = yield* IncidentService;
        const { alert, project } = yield* createHostedAlert;
        const incident = yield* incidents.openIncident(
          project.id,
          IncidentTitle.make("Investigate saturated incident history"),
        );
        yield* Effect.forEach(
          Array.from(
            { length: IncidentHistoryLimits.timelineEntriesBeforeClose - 1 },
            (_, index) => index,
          ),
          (index) =>
            incidents.addNote(
              project.id,
              incident.incident.id,
              NonEmptyText.make(`Existing note ${index + 1}`),
            ),
          { discard: true },
        );
        yield* ingestValue(project.id, 150, "01993f71-0001-7000-8000-000000000089");

        const report = yield* evaluator.evaluateProject(project.id);
        assert.strictEqual(report.transitioned, 1);
        assert.strictEqual(report.failed, 0);
        const firing = yield* alerts.findById(project.id, alert.id);
        assert(Option.isSome(firing));
        assert.strictEqual(firing.value.status, "firing");
        assert.strictEqual(
          (yield* incidents.getDetail(project.id, incident.incident.id)).timeline.length,
          IncidentHistoryLimits.timelineEntriesBeforeClose,
        );
      }).pipe(Effect.provide(EvaluatorTest)),
    ),
  );

  it.effect("evaluates the declared window instead of only the newest chart bucket", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const evaluator = yield* AlertEvaluator;
        const alerts = yield* AlertRepository;
        yield* TestClock.setTime(Date.parse("2026-08-28T07:59:10.000Z"));
        const { alert, project } = yield* createHostedAlert;
        yield* ingestValue(project.id, 200, "01993f71-0001-7000-8000-000000000091");
        yield* TestClock.setTime(Date.parse("2026-08-28T07:59:50.000Z"));
        yield* ingestValue(project.id, 50, "01993f71-0001-7000-8000-000000000092");
        yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));

        const report = yield* evaluator.evaluateProject(project.id);
        assert.strictEqual(report.transitioned, 1);
        const firing = yield* alerts.findById(project.id, alert.id);
        assert(Option.isSome(firing));
        assert.strictEqual(firing.value.status, "firing");
        assert.match(firing.value.summary ?? "", /125/);
      }).pipe(Effect.provide(EvaluatorTest)),
    ),
  );

  it.effect("evaluates tracked real projects on the periodic Effect schedule", () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2026-08-28T09:00:00.000Z"));
        const evaluator = yield* AlertEvaluator;
        const alerts = yield* AlertRepository;
        const incidentRepository = yield* IncidentRepository;
        const { alert, project } = yield* createHostedAlert;
        yield* ingestValue(project.id, 180, "01993f71-0001-7000-8000-000000000083");
        yield* evaluator.trackProject(project.id);
        yield* Layer.build(
          AlertEvaluatorMaintenance.pipe(Layer.provide(Layer.succeed(AlertEvaluator, evaluator))),
        );

        yield* TestClock.adjust("30 seconds");

        const firing = yield* alerts.findById(project.id, alert.id);
        assert(Option.isSome(firing));
        assert.strictEqual(firing.value.status, "firing");
        const persistedIncident = yield* incidentRepository.findOpen(project.id);
        assert(Option.isNone(persistedIncident));
      }).pipe(Effect.provide(EvaluatorTest)),
    ),
  );
});
