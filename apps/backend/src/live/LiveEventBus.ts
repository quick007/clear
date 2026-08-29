import {
  EventCursor,
  Heartbeat,
  type LiveEvent,
  ProductStateChanged,
  ResyncRequired,
  StreamFailure,
} from "@groundtruth/api-contract";
import type { ProjectId } from "@groundtruth/domain";
import {
  OutboxRepository,
  type OutboxEvent,
  type OutboxRepositoryShape,
  type PersistenceError,
} from "@groundtruth/persistence";
import { Context, DateTime, Effect, Layer, Option, PubSub, Ref, Schedule, Stream } from "effect";
import { isSandboxProjectId } from "../memory/SeedIds.js";

const eventCapacity = 256;
const replayPageSize = 200;
const heartbeatInterval = "15 seconds";
const durablePollInterval = "1 second"; // 1 second
const maximumSequence = 9_223_372_036_854_775_807n;

interface ReplayStart {
  readonly sequence: bigint;
  readonly controls: ReadonlyArray<LiveEvent>;
  readonly durable: boolean;
}

const cursorFor = (sequence: bigint) => EventCursor.make(sequence.toString());

const nullableCursorFor = (sequence: bigint) => (sequence === 0n ? null : cursorFor(sequence));

const parseCursor = (cursor: EventCursor) => {
  const raw = String(cursor);
  if (!/^[1-9][0-9]{0,18}$/.test(raw)) return Option.none<bigint>();
  const sequence = BigInt(raw);
  return sequence <= maximumSequence ? Option.some(sequence) : Option.none<bigint>();
};

const isDurableHint = (event: LiveEvent) => "eventId" in event;

const belongsToProject = (projectId: ProjectId) => (event: LiveEvent) =>
  !("projectId" in event) || event.projectId === projectId;

const productEvent = (event: OutboxEvent) =>
  new ProductStateChanged({
    cursor: cursorFor(event.sequence),
    projectId: event.projectId,
    occurredAt: event.createdAt,
    kind: event.kind,
    schemaVersion: event.schemaVersion,
    payload: event.payload,
  });

const streamFailure = (error: PersistenceError) =>
  new StreamFailure({
    retryable: error.retryable,
    message: "Live event replay is temporarily unavailable",
  });

const makeLiveEventBus = (outbox: OutboxRepositoryShape | null) =>
  Effect.gen(function* () {
    // Bounded replay closes the gap between constructing a stream and its SSE consumer subscribing.
    const pubsub = yield* PubSub.sliding<LiveEvent>({
      capacity: eventCapacity,
      replay: eventCapacity,
    });
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub));

    const publish = Effect.fn("LiveEventBus.publish")((event: LiveEvent) =>
      PubSub.publish(pubsub, event).pipe(Effect.asVoid),
    );

    const publishAll = Effect.fn("LiveEventBus.publishAll")((events: Iterable<LiveEvent>) =>
      Effect.forEach(events, publish, { discard: true }),
    );

    const replayAfter = (projectId: ProjectId, sequence: bigint) => {
      if (outbox === null) return Stream.empty;
      return Stream.paginate(sequence, (after) =>
        outbox.listAfter(projectId, after, replayPageSize).pipe(
          Effect.mapError(streamFailure),
          Effect.map((events) => {
            const last = events.at(-1);
            const next =
              events.length === replayPageSize && last !== undefined
                ? Option.some(last.sequence)
                : Option.none<bigint>();
            return [events.map(productEvent), next] as const;
          }),
        ),
      );
    };

    const resync = Effect.fn("LiveEventBus.resync")(function* (
      projectId: ProjectId,
      reason: "cursor-missing" | "cursor-expired",
      durable: boolean,
    ) {
      const now = yield* DateTime.now;
      if (!durable || outbox === null) {
        return {
          sequence: 0n,
          durable: false,
          controls: [
            new ResyncRequired({
              occurredAt: now,
              reason,
              earliestCursor: null,
              latestCursor: null,
            }),
          ],
        } satisfies ReplayStart;
      }

      const [earliest, latest] = yield* Effect.all([
        outbox.listAfter(projectId, 0n, 1).pipe(Effect.map((events) => events[0])),
        outbox.latest(projectId).pipe(Effect.map(Option.getOrUndefined)),
      ]);
      return {
        sequence: latest?.sequence ?? 0n,
        durable: true,
        controls: [
          new ResyncRequired({
            occurredAt: now,
            reason,
            earliestCursor: earliest === undefined ? null : cursorFor(earliest.sequence),
            latestCursor: latest === undefined ? null : cursorFor(latest.sequence),
          }),
        ],
      } satisfies ReplayStart;
    });

    const replayStart = Effect.fn("LiveEventBus.replayStart")(function* (
      projectId: ProjectId,
      cursor: EventCursor | undefined,
    ) {
      const durable = outbox !== null && !isSandboxProjectId(projectId);
      if (cursor === undefined) return yield* resync(projectId, "cursor-missing", durable);
      if (!durable || outbox === null) return yield* resync(projectId, "cursor-expired", false);

      const sequence = parseCursor(cursor);
      if (Option.isNone(sequence)) return yield* resync(projectId, "cursor-expired", true);
      const retained = yield* outbox.find(projectId, sequence.value);
      if (Option.isNone(retained)) return yield* resync(projectId, "cursor-expired", true);
      return { sequence: sequence.value, controls: [], durable: true } satisfies ReplayStart;
    });

    const stream = Effect.fn("LiveEventBus.stream")(
      (projectId: ProjectId, cursor: EventCursor | undefined) =>
        Effect.succeed(
          Stream.unwrap(
            Effect.gen(function* () {
              const subscription = yield* PubSub.subscribe(pubsub);
              const start = yield* replayStart(projectId, cursor);
              const lastSeen = yield* Ref.make(start.sequence);

              const track = (events: Stream.Stream<ProductStateChanged, StreamFailure>) =>
                events.pipe(Stream.tap((event) => Ref.set(lastSeen, BigInt(String(event.cursor)))));

              const replay = start.durable
                ? track(replayAfter(projectId, start.sequence))
                : Stream.empty;
              const initial = Stream.fromIterable(start.controls).pipe(Stream.concat(replay));
              const published = Stream.fromEffect(PubSub.take(subscription)).pipe(
                Stream.repeat(Schedule.forever),
                Stream.filter(belongsToProject(projectId)),
              );
              const updates = start.durable
                ? published.pipe(
                    Stream.map((event) => ({ _tag: "published" as const, event })),
                    Stream.merge(
                      Stream.fromEffectSchedule(
                        Effect.succeed({ _tag: "poll" as const }),
                        Schedule.spaced(durablePollInterval),
                      ),
                    ),
                    Stream.flatMap((update) => {
                      if (update._tag === "published" && !isDurableHint(update.event)) {
                        return Stream.succeed(update.event);
                      }
                      return Stream.unwrap(
                        Ref.get(lastSeen).pipe(
                          Effect.map((sequence) => track(replayAfter(projectId, sequence))),
                        ),
                      );
                    }),
                  )
                : published;
              const heartbeat = Stream.fromEffectSchedule(
                Effect.all({
                  occurredAt: DateTime.now,
                  sequence: Ref.get(lastSeen),
                }).pipe(
                  Effect.map(
                    ({ occurredAt, sequence }) =>
                      new Heartbeat({
                        occurredAt,
                        cursor: nullableCursorFor(sequence),
                      }),
                  ),
                ),
                Schedule.spaced(heartbeatInterval),
              );

              return initial.pipe(Stream.concat(updates.pipe(Stream.merge(heartbeat))));
            }).pipe(Effect.mapError(streamFailure)),
          ),
        ),
    );

    return LiveEventBus.of({ publish, publishAll, stream });
  });

export class LiveEventBus extends Context.Service<
  LiveEventBus,
  {
    publish(event: LiveEvent): Effect.Effect<void>;
    publishAll(events: Iterable<LiveEvent>): Effect.Effect<void>;
    stream(
      projectId: ProjectId,
      cursor: EventCursor | undefined,
    ): Effect.Effect<Stream.Stream<LiveEvent, StreamFailure>>;
  }
>()("groundtruth/backend/live/LiveEventBus") {
  static readonly layerDurable = Layer.effect(
    LiveEventBus,
    Effect.flatMap(OutboxRepository, makeLiveEventBus),
  );

  static readonly layer = Layer.effect(LiveEventBus, makeLiveEventBus(null));
}
