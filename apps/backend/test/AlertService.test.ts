import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  AlertName,
  AlertRuleDefinition,
  EmailAddress,
  HostedSubject,
  ProjectName,
  ProjectSlug,
  ServiceName,
  SessionId,
} from "@groundtruth/domain";
import { AccountRepository, AlertRepository, ProjectRepository } from "@groundtruth/persistence";
import { PersistenceMemory } from "@groundtruth/persistence/testing";
import { Effect, Fiber, Layer, Ref, Stream } from "effect";
import { TestClock } from "effect/testing";
import { AlertRuleLimits, AlertService } from "../src/alerts/AlertService.js";
import { IncidentState } from "../src/incidents/IncidentState.js";
import { LiveEventBus } from "../src/live/LiveEventBus.js";
import { sandboxProjectIdForSession } from "../src/memory/SeedIds.js";

const FoundationTest = Layer.mergeAll(
  PersistenceMemory,
  IncidentState.layer,
  LiveEventBus.layer,
  NodeCrypto.layer,
);
const AlertTest = Layer.merge(
  FoundationTest,
  AlertService.layer.pipe(Layer.provide(FoundationTest)),
);

const definition = (index: number, aggregation: AlertRuleDefinition["aggregation"] = "p95") =>
  new AlertRuleDefinition({
    name: AlertName.make(`Checkout latency ${index}`),
    serviceName: ServiceName.make("checkout-api"),
    metricName: "http.server.duration",
    aggregation,
    comparison: "above",
    threshold: 500,
    windowSeconds: 300,
    severity: "critical",
    enabled: true,
  });

const createHostedProject = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
  const accounts = yield* AccountRepository;
  const projects = yield* ProjectRepository;
  const account = yield* accounts.upsertHosted({
    hostedSubject: HostedSubject.make("alert-rules@example.com"),
    email: EmailAddress.make("alert-rules@example.com"),
    displayName: null,
  });
  return yield* projects.create({
    ownerId: account.id,
    slug: ProjectSlug.make("alert-rules"),
    name: ProjectName.make("Alert rules"),
    mode: "hosted",
    retentionDays: 14,
    quotas: {
      maxIngestBytesPerMinute: 10_000_000,
      maxActiveSeries: 10_000,
      maxPanels: 12,
    },
  });
});

describe("AlertService", () => {
  it.effect("persists hosted rules and deletes them by project", () =>
    Effect.gen(function* () {
      const service = yield* AlertService;
      const repository = yield* AlertRepository;
      const project = yield* createHostedProject;

      const alert = yield* service.create(project.id, definition(1));
      assert.strictEqual(alert.status, "healthy");
      assert.strictEqual(alert.summary, null);
      assert.strictEqual(yield* repository.count(project.id), 1);

      yield* service.delete(project.id, alert.id);
      assert.strictEqual(yield* repository.count(project.id), 0);

      const error = yield* Effect.flip(service.delete(project.id, alert.id));
      assert.strictEqual(error._tag, "EntityNotFound");
    }).pipe(Effect.provide(AlertTest)),
  );

  it.effect("rejects count-distinct until alert definitions support distinctKey", () =>
    Effect.gen(function* () {
      const service = yield* AlertService;
      const repository = yield* AlertRepository;
      const project = yield* createHostedProject;

      const error = yield* Effect.flip(service.create(project.id, definition(1, "count-distinct")));
      if (error._tag !== "UnsupportedAlertAggregation") return assert.fail(error._tag);
      assert.strictEqual(error.missingField, "distinctKey");
      assert.strictEqual(yield* repository.count(project.id), 0);
    }).pipe(Effect.provide(AlertTest)),
  );

  it.effect("enforces the project rule cap before another rule is persisted", () =>
    Effect.gen(function* () {
      const service = yield* AlertService;
      const repository = yield* AlertRepository;
      const project = yield* createHostedProject;

      yield* Effect.forEach(
        Array.from({ length: AlertRuleLimits.perProject }, (_, index) => index),
        (index) => service.create(project.id, definition(index)),
        { discard: true },
      );
      const error = yield* Effect.flip(
        service.create(project.id, definition(AlertRuleLimits.perProject)),
      );

      if (error._tag !== "QuotaExceeded") return assert.fail(error._tag);
      assert.strictEqual(error.quota, "alert-rules-per-project");
      assert.strictEqual(error.limit, AlertRuleLimits.perProject);
      assert.strictEqual(yield* repository.count(project.id), AlertRuleLimits.perProject);
    }).pipe(Effect.provide(AlertTest)),
  );

  it.effect("keeps sandbox alert mutations in the incident state", () =>
    Effect.gen(function* () {
      const service = yield* AlertService;
      const events = yield* LiveEventBus;
      const incidents = yield* IncidentState;
      const projectId = sandboxProjectIdForSession(
        SessionId.make("01993f71-0001-7000-8000-000000000091"),
      );

      const stream = yield* events.stream(projectId, undefined);
      const observed = yield* stream.pipe(
        Stream.filter((event) => event._tag === "AlertChanged"),
        Stream.take(2),
        Stream.runCollect,
        Effect.forkChild,
      );
      yield* Effect.yieldNow;

      const alert = yield* service.create(projectId, definition(1));
      assert.strictEqual((yield* Ref.get(incidents.state)).get(projectId)?.alerts.length, 1);

      yield* service.delete(projectId, alert.id);
      assert.strictEqual((yield* Ref.get(incidents.state)).get(projectId)?.alerts.length, 0);
      const changes = yield* Fiber.join(observed);
      assert.deepStrictEqual(
        changes.map((event) => event._tag === "AlertChanged" && event.change),
        ["created", "deleted"],
      );
    }).pipe(Effect.provide(AlertTest)),
  );
});
