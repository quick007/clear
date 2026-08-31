import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  AlertName,
  EmailAddress,
  HostedSubject,
  NonEmptyText,
  ProjectName,
  ProjectSlug,
  ServiceName,
  SessionId,
} from "@groundtruth/domain";
import { AccountRepository, ProjectRepository } from "@groundtruth/persistence";
import { PersistenceMemory } from "@groundtruth/persistence/testing";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { ManualAlertLimits, ManualAlertService } from "../src/alerts/ManualAlertService.js";
import { isSandboxProjectId, sandboxProjectIdForSession } from "../src/memory/SeedIds.js";
import { IncidentState } from "../src/incidents/IncidentState.js";

const FoundationTest = Layer.mergeAll(PersistenceMemory, NodeCrypto.layer, IncidentState.layer);
const TestLayer = Layer.merge(
  FoundationTest,
  ManualAlertService.layer.pipe(Layer.provide(FoundationTest)),
);

const input = (index: number) =>
  ({
    title: AlertName.make(`Checkout report ${index}`),
    severity: "critical",
    serviceName: ServiceName.make("checkout-api"),
    context: NonEmptyText.make("A customer reported that checkout is unavailable."),
  }) satisfies Parameters<ManualAlertService["Service"]["create"]>[1];

const createHostedProject = Effect.gen(function* () {
  const accounts = yield* AccountRepository;
  const projects = yield* ProjectRepository;
  const account = yield* accounts.upsertHosted({
    hostedSubject: HostedSubject.make("manual-alerts@example.com"),
    email: EmailAddress.make("manual-alerts@example.com"),
    displayName: null,
  });
  return yield* projects.create({
    ownerId: account.id,
    slug: ProjectSlug.make("manual-alerts"),
    name: ProjectName.make("Manual alerts"),
    mode: "hosted",
    retentionDays: 7,
    quotas: {
      maxIngestBytesPerMinute: 10_000_000,
      maxActiveSeries: 10_000,
      maxPanels: 12,
    },
  });
});

describe("ManualAlertService", () => {
  it.effect("persists typed manual alerts and keeps project lookups isolated", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
      const alerts = yield* ManualAlertService;
      const project = yield* createHostedProject;
      assert.strictEqual(isSandboxProjectId(project.id), false);
      const created = yield* alerts.create(project.id, input(1));

      assert.strictEqual(created.title, "Checkout report 1");
      assert.strictEqual(created.serviceName, "checkout-api");
      assert.deepStrictEqual(
        (yield* alerts.list(project.id)).map(({ id }) => id),
        [created.id],
      );
      assert.strictEqual((yield* alerts.find(project.id, created.id)).id, created.id);

      const sandboxProjectId = sandboxProjectIdForSession(
        SessionId.make("01993f71-0001-7000-8000-000000000099"),
      );
      const hidden = yield* Effect.flip(alerts.find(sandboxProjectId, created.id));
      assert.strictEqual(hidden._tag, "EntityNotFound");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("enforces the sandbox manual-alert history cap", () =>
    Effect.gen(function* () {
      const alerts = yield* ManualAlertService;
      const projectId = sandboxProjectIdForSession(
        SessionId.make("01993f71-0001-7000-8000-000000000098"),
      );
      yield* Effect.forEach(
        Array.from({ length: ManualAlertLimits.perProject }, (_, index) => index),
        (index) => alerts.create(projectId, input(index)),
        { discard: true },
      );

      const rejected = yield* Effect.flip(
        alerts.create(projectId, input(ManualAlertLimits.perProject)),
      );
      assert.strictEqual(rejected._tag, "QuotaExceeded");
      if (rejected._tag !== "QuotaExceeded") return;
      assert.strictEqual(rejected.quota, "manual-alerts-per-project");
      assert.strictEqual(rejected.limit, ManualAlertLimits.perProject);
    }).pipe(Effect.provide(TestLayer)),
  );
});
