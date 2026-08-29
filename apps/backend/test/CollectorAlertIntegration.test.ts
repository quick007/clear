import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { EventCursor, OtlpMetricsRequest } from "@groundtruth/api-contract";
import {
  AlertName,
  EmailAddress,
  HostedSubject,
  ProjectName,
  ProjectSlug,
  ServiceName,
} from "@groundtruth/domain";
import {
  AccountRepository,
  AlertRepository,
  IncidentRepository,
  OutboxRepository,
  ProjectRepository,
} from "@groundtruth/persistence";
import { PersistenceMemory } from "@groundtruth/persistence/testing";
import { DateTime, Effect, Layer, Option, Stream } from "effect";
import { TestClock } from "effect/testing";
import { AlertEvaluator, AlertEvaluatorMaintenance } from "../src/alerts/AlertEvaluator.js";
import { IncidentServiceLive } from "../src/incidents/IncidentServiceLive.js";
import { IncidentState } from "../src/incidents/IncidentState.js";
import { LiveEventBus } from "../src/live/LiveEventBus.js";
import { CollectorIngestService } from "../src/telemetry/CollectorIngestService.js";
import { CollectorQuotaService } from "../src/telemetry/CollectorQuotaService.js";
import { TelemetryStore } from "../src/telemetry/TelemetryStore.js";

const DurableEventsTest = LiveEventBus.layerDurable.pipe(Layer.provideMerge(PersistenceMemory));
const FoundationTest = Layer.mergeAll(
  DurableEventsTest,
  IncidentState.layer,
  TelemetryStore.layerMemory,
  NodeCrypto.layer,
);
const IncidentTest = IncidentServiceLive.pipe(Layer.provideMerge(FoundationTest));
const AlertTest = AlertEvaluator.layer.pipe(Layer.provideMerge(IncidentTest));
const QuotaTest = CollectorQuotaService.layer.pipe(Layer.provideMerge(AlertTest));
const CollectorTest = CollectorIngestService.layer.pipe(Layer.provideMerge(QuotaTest));

const createHostedAlert = Effect.gen(function* () {
  const accounts = yield* AccountRepository;
  const projects = yield* ProjectRepository;
  const alerts = yield* AlertRepository;
  const account = yield* accounts.upsertHosted({
    hostedSubject: HostedSubject.make("collector-alert@example.com"),
    email: EmailAddress.make("collector-alert@example.com"),
    displayName: null,
  });
  const project = yield* projects.create({
    ownerId: account.id,
    slug: ProjectSlug.make("collector-alert"),
    name: ProjectName.make("Collector alert"),
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
    serviceName: ServiceName.make("checkout-api"),
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

const metricsAt = (now: DateTime.Utc) =>
  new OtlpMetricsRequest({
    resourceMetrics: [
      {
        resource: {
          attributes: [{ key: "service.name", value: { stringValue: "checkout-api" } }],
        },
        scopeMetrics: [
          {
            scope: { name: "groundtruth.collector-alert.test", version: "1.0.0" },
            metrics: [
              {
                name: "http.server.duration",
                description: "Server request duration",
                unit: "ms",
                gauge: {
                  dataPoints: [
                    {
                      timeUnixNano: (BigInt(DateTime.toEpochMillis(now)) * 1_000_000n).toString(),
                      asDouble: 180,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  });

describe("Collector alert integration", () => {
  it.effect("tracks accepted metrics through scheduled evaluation and durable live replay", () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
        const collector = yield* CollectorIngestService;
        const evaluator = yield* AlertEvaluator;
        const alerts = yield* AlertRepository;
        const incidents = yield* IncidentRepository;
        const outbox = yield* OutboxRepository;
        const events = yield* LiveEventBus;
        const { alert, project } = yield* createHostedAlert;
        const before = Option.getOrThrow(yield* outbox.latest(project.id));
        const acceptedAt = yield* DateTime.now;

        yield* Layer.build(
          AlertEvaluatorMaintenance.pipe(Layer.provide(Layer.succeed(AlertEvaluator, evaluator))),
        );
        yield* collector.enqueueMetrics(project.id, metricsAt(acceptedAt), 512);
        yield* TestClock.adjust("30 seconds");

        const firing = Option.getOrThrow(yield* alerts.findById(project.id, alert.id));
        assert.strictEqual(firing.status, "firing");
        assert.strictEqual(
          firing.firingSince === null ? null : DateTime.toEpochMillis(firing.firingSince),
          Date.parse("2026-08-28T08:00:30.000Z"),
        );
        assert(Option.isNone(yield* incidents.findOpen(project.id)));

        const committed = yield* outbox.listAfter(project.id, before.sequence, 10);
        const alertEvent = committed.find(({ kind }) => kind === "alert.state_changed");
        assert(alertEvent !== undefined);
        assert.deepStrictEqual(alertEvent.payload, {
          alertId: alert.id,
          status: "firing",
          updatedAt: "2026-08-28T08:00:30.000Z",
        });

        const stream = yield* events.stream(
          project.id,
          EventCursor.make(before.sequence.toString()),
        );
        const replayed = Option.getOrThrow(
          yield* stream.pipe(
            Stream.filter(
              (event) =>
                event._tag === "ProductStateChanged" && event.kind === "alert.state_changed",
            ),
            Stream.runHead,
          ),
        );
        assert(replayed._tag === "ProductStateChanged");
        assert.strictEqual(replayed.cursor, EventCursor.make(alertEvent.sequence.toString()));
        assert.deepStrictEqual(replayed.payload, alertEvent.payload);
      }).pipe(Effect.provide(CollectorTest)),
    ),
  );
});
