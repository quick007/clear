import {
  Cursor,
  IncidentDetail,
  DeployEventPage,
  DeployRecorded,
  LiveEventId,
  ServiceUnavailable,
  type QueryWindow,
  type RecordDeployEventRequest,
  TimelineEntryAdded,
} from "@groundtruth/api-contract";
import {
  DeployEvent,
  DeployEventId,
  InvalidCursor,
  type ProjectId,
  TimelineDeploy,
  TimelineEntryId,
} from "@groundtruth/domain";
import { DeployEventRepository, type PersistenceError } from "@groundtruth/persistence";
import { Context, Crypto, DateTime, Effect, Layer, Ref, Schema } from "effect";
import { BoardService } from "../board/BoardService.js";
import { incidentTimelineHasMutationCapacity } from "../incidents/IncidentHistoryPolicy.js";
import { IncidentState, type IncidentStateMap } from "../incidents/IncidentState.js";
import { LiveEventBus } from "../live/LiveEventBus.js";
import { isSandboxProjectId } from "../memory/SeedIds.js";

export interface DeployListFilter {
  readonly service?: RecordDeployEventRequest["service"] | undefined;
  readonly window?: QueryWindow | undefined;
  readonly cursor?: Cursor | undefined;
  readonly limit?: number | undefined;
}

type DeployStore = ReadonlyMap<ProjectId, ReadonlyArray<DeployEvent>>;

const defaultPageSize = 50;
const maximumPageSize = 200;
const epoch = DateTime.fromDateUnsafe(new Date(0));
const windowMilliseconds: Record<QueryWindow, number> = {
  "5m": 5 * 60 * 1_000, // 5 minutes
  "15m": 15 * 60 * 1_000, // 15 minutes
  "1h": 60 * 60 * 1_000, // 1 hour
  "3h": 3 * 60 * 60 * 1_000, // 3 hours
  "6h": 6 * 60 * 60 * 1_000, // 6 hours
  "12h": 12 * 60 * 60 * 1_000, // 12 hours
  "24h": 24 * 60 * 60 * 1_000, // 24 hours
  "7d": 7 * 24 * 60 * 60 * 1_000, // 7 days
};

const replaceProject = <Value>(
  all: ReadonlyMap<ProjectId, Value>,
  projectId: ProjectId,
  value: Value,
) => {
  const next = new Map(all);
  next.set(projectId, value);
  return next;
};

const newestFirst = (left: DeployEvent, right: DeployEvent) => {
  const timeDifference =
    DateTime.toEpochMillis(right.deployedAt) - DateTime.toEpochMillis(left.deployedAt);
  return timeDifference === 0 ? String(right.id).localeCompare(String(left.id)) : timeDifference;
};

const eventId = (uuid: string) => LiveEventId.make(uuid);

const invalidCursor = (cursor: Cursor) =>
  new InvalidCursor({ rawCursor: cursor, message: "Deploy event cursor is malformed" });

const encodeCursor = (cursor: { readonly deployedAt: DateTime.Utc; readonly id: DeployEventId }) =>
  Cursor.make(`${DateTime.toEpochMillis(cursor.deployedAt)}.${cursor.id}`);

const decodeCursor = Effect.fn("DeployService.decodeCursor")(function* (cursor: Cursor) {
  const [rawTime, rawId, ...extra] = String(cursor).split(".");
  const timestamp = Number(rawTime);
  if (
    rawTime === undefined ||
    rawId === undefined ||
    extra.length > 0 ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0
  ) {
    return yield* invalidCursor(cursor);
  }
  const id = yield* Schema.decodeUnknownEffect(DeployEventId)(rawId).pipe(
    Effect.mapError(() => invalidCursor(cursor)),
  );
  return { deployedAt: DateTime.fromDateUnsafe(new Date(timestamp)), id };
});

const unavailable = (_error: PersistenceError) =>
  new ServiceUnavailable({
    service: "deploy-events",
    message: "Deploy event storage is temporarily unavailable",
  });

const pageDeploys = Effect.fn("DeployService.pageDeploys")(function* (
  source: ReadonlyArray<DeployEvent>,
  filter: DeployListFilter,
  now: DateTime.Utc,
) {
  const earliest =
    filter.window === undefined
      ? null
      : DateTime.toEpochMillis(now) - windowMilliseconds[filter.window];
  const before = filter.cursor === undefined ? undefined : yield* decodeCursor(filter.cursor);
  const candidates = [...source]
    .filter(
      (deploy) =>
        (filter.service === undefined || deploy.serviceName === filter.service) &&
        (earliest === null || DateTime.toEpochMillis(deploy.deployedAt) >= earliest) &&
        (before === undefined ||
          DateTime.toEpochMillis(deploy.deployedAt) < DateTime.toEpochMillis(before.deployedAt) ||
          (DateTime.toEpochMillis(deploy.deployedAt) ===
            DateTime.toEpochMillis(before.deployedAt) &&
            String(deploy.id) < String(before.id))),
    )
    .sort(newestFirst);
  const limit = Math.max(1, Math.min(filter.limit ?? defaultPageSize, maximumPageSize));
  const events = candidates.slice(0, limit);
  const hasMore = events.length < candidates.length;
  const last = events.at(-1);
  return new DeployEventPage({
    events,
    nextCursor: hasMore && last !== undefined ? encodeCursor(last) : null,
    hasMore,
  });
});

export class DeployService extends Context.Service<
  DeployService,
  {
    record(
      projectId: ProjectId,
      input: RecordDeployEventRequest,
    ): Effect.Effect<DeployEvent, ServiceUnavailable>;
    list(
      projectId: ProjectId,
      filter: DeployListFilter,
    ): Effect.Effect<DeployEventPage, InvalidCursor | ServiceUnavailable>;
    clearProject(projectId: ProjectId): Effect.Effect<void>;
  }
>()("groundtruth/backend/deploys/DeployService") {
  static readonly layerMemory = Layer.effect(
    DeployService,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const boards = yield* BoardService;
      const incidents = yield* IncidentState;
      const liveEvents = yield* LiveEventBus;
      const store = yield* Ref.make<DeployStore>(new Map());

      const record = Effect.fn("DeployService.record")(function* (
        projectId: ProjectId,
        input: RecordDeployEventRequest,
      ) {
        const receivedAt = yield* DateTime.now;
        const deploy = new DeployEvent({
          id: DeployEventId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie)),
          projectId,
          serviceName: input.service,
          sha: input.sha,
          description: input.description ?? null,
          url: input.url ?? null,
          deployedAt: input.deployedAt ?? receivedAt,
          receivedAt,
        });
        const deployEventId = eventId(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const timelineEventId = eventId(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const timelineId = TimelineEntryId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));

        yield* Ref.update(store, (all) =>
          replaceProject(all, projectId, [...(all.get(projectId) ?? []), deploy]),
        );

        const timeline = yield* Ref.modify<IncidentStateMap, TimelineDeploy | null>(
          incidents.state,
          (all) => {
            const project = all.get(projectId);
            const detail = project?.detail;
            if (
              project === undefined ||
              detail === null ||
              detail === undefined ||
              detail.incident.status !== "open" ||
              !incidentTimelineHasMutationCapacity(detail)
            ) {
              return [null, all];
            }
            const entry = new TimelineDeploy({
              id: timelineId,
              projectId,
              incidentId: detail.incident.id,
              occurredAt: deploy.deployedAt,
              deployEventId: deploy.id,
              serviceName: deploy.serviceName,
              sha: deploy.sha,
            });
            const nextDetail = new IncidentDetail({
              incident: detail.incident,
              hypotheses: detail.hypotheses,
              timeline: [...detail.timeline, entry],
            });
            return [entry, replaceProject(all, projectId, { ...project, detail: nextDetail })];
          },
        );

        yield* liveEvents.publish(
          new DeployRecorded({
            eventId: deployEventId,
            projectId,
            occurredAt: receivedAt,
            deploy,
          }),
        );
        yield* boards.annotateDeploy(projectId, deploy);
        if (timeline !== null) {
          yield* liveEvents.publish(
            new TimelineEntryAdded({
              eventId: timelineEventId,
              projectId,
              occurredAt: receivedAt,
              entry: timeline,
            }),
          );
        }
        return deploy;
      });

      const list = Effect.fn("DeployService.list")(function* (
        projectId: ProjectId,
        filter: DeployListFilter,
      ) {
        const now = yield* DateTime.now;
        return yield* pageDeploys((yield* Ref.get(store)).get(projectId) ?? [], filter, now);
      });

      const clearProject = Effect.fn("DeployService.clearProject")((projectId: ProjectId) =>
        Ref.update(store, (all) => {
          const next = new Map(all);
          next.delete(projectId);
          return next;
        }),
      );

      return DeployService.of({ record, list, clearProject });
    }),
  );

  static readonly layerPersistence = Layer.effect(
    DeployService,
    Effect.gen(function* () {
      const repository = yield* DeployEventRepository;
      const boards = yield* BoardService;
      const crypto = yield* Crypto.Crypto;
      const liveEvents = yield* LiveEventBus;
      const memoryContext = yield* Layer.build(DeployService.layerMemory);
      const memory = Context.get(memoryContext, DeployService);

      const recordHosted = Effect.fn("DeployService.recordHosted")(function* (
        projectId: ProjectId,
        input: RecordDeployEventRequest,
      ) {
        const receivedAt = yield* DateTime.now;
        const deploy = yield* repository
          .record(projectId, {
            serviceName: input.service,
            sha: input.sha,
            description: input.description ?? null,
            url: input.url ?? null,
            deployedAt: input.deployedAt ?? receivedAt,
          })
          .pipe(Effect.mapError(unavailable));
        const deployEventId = eventId(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        yield* liveEvents.publish(
          new DeployRecorded({
            eventId: deployEventId,
            projectId,
            occurredAt: deploy.receivedAt,
            deploy,
          }),
        );
        yield* boards.annotateDeploy(projectId, deploy);
        return deploy;
      });

      const listHosted = Effect.fn("DeployService.listHosted")(function* (
        projectId: ProjectId,
        filter: DeployListFilter,
      ) {
        const now = yield* DateTime.now;
        const since =
          filter.window === undefined
            ? epoch
            : DateTime.fromDateUnsafe(
                new Date(DateTime.toEpochMillis(now) - windowMilliseconds[filter.window]),
              );
        const before = filter.cursor === undefined ? undefined : yield* decodeCursor(filter.cursor);
        const page = yield* repository
          .list(projectId, {
            since,
            serviceName: filter.service,
            before,
            limit: filter.limit ?? defaultPageSize,
          })
          .pipe(Effect.mapError(unavailable));
        return new DeployEventPage({
          events: page.events,
          nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
          hasMore: page.hasMore,
        });
      });

      return DeployService.of({
        record: (projectId, input) =>
          isSandboxProjectId(projectId)
            ? memory.record(projectId, input)
            : recordHosted(projectId, input),
        list: (projectId, filter) =>
          isSandboxProjectId(projectId)
            ? memory.list(projectId, filter)
            : listHosted(projectId, filter),
        clearProject: (projectId) =>
          isSandboxProjectId(projectId) ? memory.clearProject(projectId) : Effect.void,
      });
    }),
  );

  static readonly layer = DeployService.layerMemory;
}
