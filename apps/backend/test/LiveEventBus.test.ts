import { assert, describe, it } from "@effect/vitest";
import { EventCursor } from "@groundtruth/api-contract";
import { EmailAddress, HostedSubject, ProjectName, ProjectSlug } from "@groundtruth/domain";
import { AccountRepository, OutboxRepository, ProjectRepository } from "@groundtruth/persistence";
import { PersistenceMemory } from "@groundtruth/persistence/testing";
import { Context, Effect, Fiber, Layer, Option, Stream } from "effect";
import { TestClock } from "effect/testing";
import { LiveEventBus } from "../src/live/LiveEventBus.js";

const LiveEventsTest = LiveEventBus.layerDurable.pipe(Layer.provideMerge(PersistenceMemory));

const createProject = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse("2026-08-28T08:00:00.000Z"));
  const accounts = yield* AccountRepository;
  const projects = yield* ProjectRepository;
  const account = yield* accounts.upsertHosted({
    hostedSubject: HostedSubject.make("live-events@example.com"),
    email: EmailAddress.make("live-events@example.com"),
    displayName: null,
  });
  return yield* projects.create({
    ownerId: account.id,
    slug: ProjectSlug.make("live-events"),
    name: ProjectName.make("Live events"),
    mode: "hosted",
    retentionDays: 7,
    quotas: {
      maxIngestBytesPerMinute: 10_000_000,
      maxActiveSeries: 10_000,
      maxPanels: 12,
    },
  });
});

const cursor = (sequence: bigint) => EventCursor.make(sequence.toString());

describe("LiveEventBus", () => {
  it.effect("replays committed rows after a restart and supplied cursor", () =>
    Effect.gen(function* () {
      const outbox = yield* OutboxRepository;
      const project = yield* createProject;
      const before = Option.getOrThrow(yield* outbox.latest(project.id));
      const appended = yield* outbox.append({
        projectId: project.id,
        kind: "panel.updated",
        payload: { panelId: "01993f71-0001-7000-8000-000000000011", position: 2 },
      });

      const restartedContext = yield* Layer.build(
        Layer.fresh(LiveEventBus.layerDurable).pipe(
          Layer.provide(Layer.succeed(OutboxRepository, outbox)),
        ),
      );
      const restarted = Context.get(restartedContext, LiveEventBus);
      const stream = yield* restarted.stream(project.id, cursor(before.sequence));
      const replayed = yield* stream.pipe(Stream.take(1), Stream.runCollect);
      const event = replayed[0];

      assert(event?._tag === "ProductStateChanged");
      assert.strictEqual(event.cursor, cursor(appended.sequence));
      assert.strictEqual(event.kind, "panel.updated");
      assert.deepStrictEqual(event.payload, {
        panelId: "01993f71-0001-7000-8000-000000000011",
        position: 2,
      });
    }).pipe(Effect.provide(LiveEventsTest)),
  );

  it.effect("returns retained cursor bounds when the cursor is absent or expired", () =>
    Effect.gen(function* () {
      const events = yield* LiveEventBus;
      const outbox = yield* OutboxRepository;
      const project = yield* createProject;
      const earliest = Option.getOrThrow(yield* outbox.latest(project.id));
      const latest = yield* outbox.append({
        projectId: project.id,
        kind: "incident.opened",
        payload: { incidentId: "01993f71-0001-7000-8000-000000000012" },
      });

      const missingStream = yield* events.stream(project.id, undefined);
      const missing = yield* missingStream.pipe(Stream.take(1), Stream.runHead);
      const missingEvent = Option.getOrThrow(missing);
      assert(missingEvent._tag === "ResyncRequired");
      assert.strictEqual(missingEvent.reason, "cursor-missing");
      assert.strictEqual(missingEvent.earliestCursor, cursor(earliest.sequence));
      assert.strictEqual(missingEvent.latestCursor, cursor(latest.sequence));

      const expiredStream = yield* events.stream(
        project.id,
        EventCursor.make("9223372036854775807"),
      );
      const expired = Option.getOrThrow(yield* expiredStream.pipe(Stream.take(1), Stream.runHead));
      assert(expired._tag === "ResyncRequired");
      assert.strictEqual(expired.reason, "cursor-expired");
      assert.strictEqual(expired.latestCursor, cursor(latest.sequence));
    }).pipe(Effect.provide(LiveEventsTest)),
  );

  it.effect("polls committed outbox rows when no process-local hint was published", () =>
    Effect.gen(function* () {
      const events = yield* LiveEventBus;
      const outbox = yield* OutboxRepository;
      const project = yield* createProject;
      const before = Option.getOrThrow(yield* outbox.latest(project.id));
      const stream = yield* events.stream(project.id, cursor(before.sequence));
      const nextEvent = yield* stream.pipe(
        Stream.filter((event) => event._tag === "ProductStateChanged"),
        Stream.runHead,
        Effect.forkChild,
      );
      yield* Effect.yieldNow;

      const appended = yield* outbox.append({
        projectId: project.id,
        kind: "alert.state_changed",
        payload: { alertId: "01993f71-0001-7000-8000-000000000013", status: "firing" },
      });
      yield* TestClock.adjust("1 second");

      const event = Option.getOrThrow(yield* Fiber.join(nextEvent));
      assert(event._tag === "ProductStateChanged");
      assert.strictEqual(event.cursor, cursor(appended.sequence));
      assert.strictEqual(event.kind, "alert.state_changed");
    }).pipe(Effect.provide(LiveEventsTest)),
  );
});
