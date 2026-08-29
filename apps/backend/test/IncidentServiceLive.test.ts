import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  EmailAddress,
  HostedSubject,
  IncidentTitle,
  NonEmptyText,
  ProjectName,
  ProjectSlug,
  ServiceName,
  SessionId,
  Sha,
} from "@groundtruth/domain";
import {
  AccountRepository,
  AlertRepository,
  DeployEventRepository,
  IncidentRepository,
  ProjectRepository,
} from "@groundtruth/persistence";
import { PersistenceMemory, RepositoriesMemoryControl } from "@groundtruth/persistence/testing";
import { Context, Crypto, DateTime, Effect, Layer, Stream } from "effect";
import { TestClock } from "effect/testing";
import { IncidentService } from "../src/incidents/IncidentService.js";
import { IncidentServiceLive } from "../src/incidents/IncidentServiceLive.js";
import { IncidentState } from "../src/incidents/IncidentState.js";
import { LiveEventBus } from "../src/live/LiveEventBus.js";
import { sandboxProjectIdForSession } from "../src/memory/SeedIds.js";

const FoundationTest = Layer.mergeAll(
  PersistenceMemory,
  IncidentState.layer,
  LiveEventBus.layer,
  NodeCrypto.layer,
);
const IncidentTest = Layer.merge(
  FoundationTest,
  IncidentServiceLive.pipe(Layer.provide(FoundationTest)),
);

const createHostedProject = Effect.gen(function* () {
  const accounts = yield* AccountRepository;
  const projects = yield* ProjectRepository;
  const account = yield* accounts.upsertHosted({
    hostedSubject: HostedSubject.make("incident-operator@example.com"),
    email: EmailAddress.make("incident-operator@example.com"),
    displayName: null,
  });
  return yield* projects.create({
    ownerId: account.id,
    slug: ProjectSlug.make("incident-checkout"),
    name: ProjectName.make("Incident checkout"),
    mode: "hosted",
    retentionDays: 14,
    quotas: {
      maxIngestBytesPerMinute: 10_000_000,
      maxActiveSeries: 10_000,
      maxPanels: 12,
    },
  });
});

const rebuildIncidentService = Effect.gen(function* () {
  const alerts = yield* AlertRepository;
  const repository = yield* IncidentRepository;
  const events = yield* LiveEventBus;
  const crypto = yield* Crypto.Crypto;
  const state = yield* IncidentState;
  const context = yield* Layer.build(
    Layer.fresh(IncidentServiceLive).pipe(
      Layer.provide([
        Layer.succeed(AlertRepository, alerts),
        Layer.succeed(IncidentRepository, repository),
        Layer.succeed(IncidentState, state),
        Layer.succeed(LiveEventBus, events),
        Layer.succeed(Crypto.Crypto, crypto),
      ]),
    ),
  );
  return Context.get(context, IncidentService);
});

describe("IncidentServiceLive", () => {
  it.effect("keeps hosted retry-storm initialization idempotent and durable", () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
        const incidents = yield* IncidentService;
        const project = yield* createHostedProject;
        const title = IncidentTitle.make("Checkout retry amplification");

        const created = yield* incidents.ensureIncident(project.id, title);
        const existing = yield* incidents.ensureIncident(project.id, title);

        assert.strictEqual(created.changed, true);
        assert.strictEqual(existing.changed, false);
        assert.strictEqual(existing.detail.incident.id, created.detail.incident.id);

        const restarted = yield* rebuildIncidentService;
        const restored = yield* restarted.getOpenIncident(project.id);
        assert.strictEqual(restored?.id, created.detail.incident.id);
      }).pipe(Effect.provide(IncidentTest)),
    ),
  );

  it.effect("persists and reconstructs the hosted incident lifecycle", () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
        const incidents = yield* IncidentService;
        const deploys = yield* DeployEventRepository;
        const liveEvents = yield* LiveEventBus;
        const project = yield* createHostedProject;
        const opened = yield* incidents.openIncident(
          project.id,
          IncidentTitle.make("Checkout retry amplification"),
        );
        const now = yield* DateTime.now;
        yield* deploys.record(project.id, {
          serviceName: ServiceName.make("checkout-api"),
          sha: Sha.make("abcdef123456"),
          description: null,
          url: null,
          deployedAt: DateTime.addDuration(now, "1 hour"),
        });
        const liveStream = yield* liveEvents.stream(project.id, undefined);
        const proposed = yield* incidents.setHypothesis(project.id, opened.incident.id, {
          text: NonEmptyText.make("A traffic surge is saturating checkout"),
          status: "proposed",
        });
        yield* incidents.setHypothesis(project.id, opened.incident.id, {
          hypothesisId: proposed.id,
          text: proposed.text,
          status: "rejected",
        });
        yield* incidents.addNote(
          project.id,
          opened.incident.id,
          NonEmptyText.make("Unique users remained flat while retries climbed"),
        );
        yield* incidents.close(
          project.id,
          opened.incident.id,
          NonEmptyText.make("Retry amplification stopped after the retry budget shipped"),
        );
        const publishedTimeline = yield* liveStream.pipe(
          Stream.filter((event) => event._tag === "TimelineEntryAdded"),
          Stream.take(4),
          Stream.runCollect,
        );
        assert.deepStrictEqual(
          Array.from(publishedTimeline, (event) =>
            event._tag === "TimelineEntryAdded" ? event.entry._tag : null,
          ),
          ["hypothesis", "hypothesis", "note", "incident-status"],
        );

        const restarted = yield* rebuildIncidentService;
        assert.notStrictEqual(restarted, incidents);
        const restored = yield* restarted.getDetail(project.id, opened.incident.id);
        const history = yield* restarted.listIncidents(project.id);

        assert.strictEqual(yield* restarted.getOpenIncident(project.id), null);
        assert.deepStrictEqual(
          history.map(({ id }) => id),
          [opened.incident.id],
        );
        assert.strictEqual(restored.incident.status, "closed");
        assert.strictEqual(restored.hypotheses.length, 1);
        assert.strictEqual(restored.hypotheses[0]?.status, "rejected");
        assert.deepStrictEqual(restored.timeline.map(({ _tag }) => _tag).sort(), [
          "deploy",
          "hypothesis",
          "hypothesis",
          "incident-status",
          "incident-status",
          "note",
        ]);
        const occurredAt = restored.timeline.map((entry) =>
          DateTime.toEpochMillis(entry.occurredAt),
        );
        assert.deepStrictEqual(
          occurredAt,
          [...occurredAt].sort((left, right) => left - right),
        );
      }).pipe(Effect.provide(IncidentTest)),
    ),
  );

  it.effect("keeps sandbox incidents out of persistence", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const incidents = yield* IncidentService;
        const persisted = yield* RepositoriesMemoryControl;
        const sandboxProjectId = sandboxProjectIdForSession(
          SessionId.make("01993f71-0001-7000-8000-000000000073"),
        );
        const opened = yield* incidents.openIncident(
          sandboxProjectId,
          IncidentTitle.make("Sandbox retry amplification"),
        );
        yield* incidents.addNote(
          sandboxProjectId,
          opened.incident.id,
          NonEmptyText.make("This note belongs only to the active sandbox"),
        );

        const snapshot = yield* persisted.snapshot;
        assert.strictEqual(
          snapshot.incidents.some(({ projectId }) => projectId === sandboxProjectId),
          false,
        );
        assert.strictEqual(
          snapshot.timelines.some(({ projectId }) => projectId === sandboxProjectId),
          false,
        );
      }).pipe(Effect.provide(IncidentTest)),
    ),
  );
});
