import {
  IncidentChanged,
  IncidentDetail,
  LiveEventId,
  ServiceUnavailable,
  TimelineEntryAdded,
} from "@groundtruth/api-contract";
import {
  EntityNotFound,
  InvalidStateTransition,
  QuotaExceeded,
  ResourceConflict,
  type HypothesisId,
  type IncidentId,
  type IncidentTitle,
  type NonEmptyText,
  type ProjectId,
} from "@groundtruth/domain";
import {
  AlertRepository,
  IncidentRepository,
  type IncidentRecord,
  type PersistenceError,
  type RepositoryConflict,
  type RepositoryQuotaExceeded,
} from "@groundtruth/persistence";
import { Context, Crypto, DateTime, Effect, Layer, Option } from "effect";
import { LiveEventBus } from "../live/LiveEventBus.js";
import { isSandboxProjectId } from "../memory/SeedIds.js";
import { type AlertFilter, IncidentService } from "./IncidentService.js";

const unavailable = (error: PersistenceError) =>
  new ServiceUnavailable({
    service: error.store,
    message: `Storage operation failed (reference ${error.correlationId})`,
  });

const missingIncident = (incidentId: IncidentId) =>
  new EntityNotFound({ entity: "incident", id: incidentId, message: "Incident not found" });

const closedIncident = () =>
  new InvalidStateTransition({
    resource: "incident",
    from: "closed",
    to: "update",
    message: "Closed incidents cannot be changed",
  });

const repositoryQuota = (error: RepositoryQuotaExceeded) =>
  new QuotaExceeded({
    quota: error.resource,
    limit: error.limit,
    observed: error.observed,
    message: `Incident limit reached for ${error.resource}`,
  });

const repositoryConflict = (_error: RepositoryConflict) => closedIncident();

const toDetail = (record: IncidentRecord) =>
  new IncidentDetail({
    incident: record.incident,
    hypotheses: record.hypotheses,
    timeline: record.timeline,
  });

export const IncidentServiceLive = Layer.effect(
  IncidentService,
  Effect.gen(function* () {
    const alerts = yield* AlertRepository;
    const repository = yield* IncidentRepository;
    const events = yield* LiveEventBus;
    const crypto = yield* Crypto.Crypto;
    const memoryContext = yield* Layer.build(IncidentService.layer);
    const memory = Context.get(memoryContext, IncidentService);

    const fromRepository = <Value>(effect: Effect.Effect<Value, PersistenceError>) =>
      effect.pipe(
        Effect.tapError((error) => Effect.logError("Incident storage operation failed", { error })),
        Effect.mapError(unavailable),
      );

    const fromMutationRepository = <Value>(
      effect: Effect.Effect<Value, PersistenceError | RepositoryQuotaExceeded | RepositoryConflict>,
    ) =>
      effect.pipe(
        Effect.tapError((error) =>
          error._tag === "PersistenceError"
            ? Effect.logError("Incident storage operation failed", { error })
            : Effect.void,
        ),
        Effect.mapError((error) => {
          switch (error._tag) {
            case "PersistenceError":
              return unavailable(error);
            case "RepositoryQuotaExceeded":
              return repositoryQuota(error);
            case "RepositoryConflict":
              return repositoryConflict(error);
          }
        }),
      );

    const liveEventId = crypto.randomUUIDv7.pipe(
      Effect.orDie,
      Effect.map((id) => LiveEventId.make(id)),
    );

    const getRecord = Effect.fn("IncidentServiceLive.getRecord")(function* (
      projectId: ProjectId,
      incidentId: IncidentId,
    ) {
      const record = yield* fromRepository(repository.getDetail(projectId, incidentId));
      if (Option.isNone(record)) return yield* missingIncident(incidentId);
      return record.value;
    });

    const readBack = (projectId: ProjectId, incidentId: IncidentId) =>
      getRecord(projectId, incidentId).pipe(
        Effect.catchTag("EntityNotFound", () =>
          Effect.fail(
            new ServiceUnavailable({
              service: "postgres",
              message: "The incident could not be read back",
            }),
          ),
        ),
      );

    const publishIncident = Effect.fn("IncidentServiceLive.publishIncident")(function* (
      projectId: ProjectId,
      incident: IncidentRecord["incident"],
      change: "opened" | "updated" | "closed",
    ) {
      yield* events.publish(
        new IncidentChanged({
          eventId: yield* liveEventId,
          projectId,
          occurredAt: yield* DateTime.now,
          incident,
          change,
        }),
      );
    });

    const publishTimeline = Effect.fn("IncidentServiceLive.publishTimeline")(function* (
      projectId: ProjectId,
      entry: IncidentRecord["timeline"][number] | undefined,
    ) {
      if (entry !== undefined) {
        yield* events.publish(
          new TimelineEntryAdded({
            eventId: yield* liveEventId,
            projectId,
            occurredAt: entry.occurredAt,
            entry,
          }),
        );
      }
    });

    const listAlerts = Effect.fn("IncidentServiceLive.listAlerts")(function* (
      projectId: ProjectId,
      filter: AlertFilter,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.listAlerts(projectId, filter);
      return (yield* fromRepository(alerts.list(projectId))).filter(
        (alert) =>
          (filter.status === undefined || alert.status === filter.status) &&
          (filter.severity === undefined || alert.severity === filter.severity) &&
          (filter.service === undefined || alert.serviceName === filter.service),
      );
    });

    const getOpenIncident = Effect.fn("IncidentServiceLive.getOpenIncident")(function* (
      projectId: ProjectId,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.getOpenIncident(projectId);
      return Option.getOrNull(yield* fromRepository(repository.findOpen(projectId)));
    });

    const listIncidents = Effect.fn("IncidentServiceLive.listIncidents")(function* (
      projectId: ProjectId,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.listIncidents(projectId);
      return yield* fromRepository(repository.list(projectId));
    });

    const getDetail = Effect.fn("IncidentServiceLive.getDetail")(function* (
      projectId: ProjectId,
      incidentId: IncidentId,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.getDetail(projectId, incidentId);
      return toDetail(yield* getRecord(projectId, incidentId));
    });

    const openIncident = Effect.fn("IncidentServiceLive.openIncident")(function* (
      projectId: ProjectId,
      title: IncidentTitle,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.openIncident(projectId, title);
      if (Option.isSome(yield* fromRepository(repository.findOpen(projectId)))) {
        return yield* new ResourceConflict({
          resource: "incident",
          message: "A project can have only one open incident",
        });
      }
      const incident = yield* fromRepository(repository.open(projectId, { title }));
      const detail = toDetail(yield* readBack(projectId, incident.id));
      yield* publishIncident(projectId, incident, "opened");
      return detail;
    });

    const ensureIncident = Effect.fn("IncidentServiceLive.ensureIncident")(function* (
      projectId: ProjectId,
      title: IncidentTitle,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.ensureIncident(projectId, title);
      const existing = yield* fromRepository(repository.findOpen(projectId));
      if (Option.isSome(existing)) {
        return {
          detail: toDetail(yield* readBack(projectId, existing.value.id)),
          changed: false,
        };
      }
      return yield* openIncident(projectId, title).pipe(
        Effect.map((detail) => ({ detail, changed: true })),
        Effect.catchTag("ResourceConflict", () =>
          fromRepository(repository.findOpen(projectId)).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    new ServiceUnavailable({
                      service: "postgres",
                      message: "The concurrently opened incident could not be read back",
                    }),
                  ),
                onSome: (incident) =>
                  readBack(projectId, incident.id).pipe(
                    Effect.map((record) => ({ detail: toDetail(record), changed: false })),
                  ),
              }),
            ),
          ),
        ),
      );
    });

    const setHypothesis = Effect.fn("IncidentServiceLive.setHypothesis")(function* (
      projectId: ProjectId,
      incidentId: IncidentId,
      input: {
        readonly hypothesisId?: HypothesisId;
        readonly text: NonEmptyText;
        readonly status: "proposed" | "testing" | "rejected" | "confirmed";
      },
    ) {
      if (isSandboxProjectId(projectId))
        return yield* memory.setHypothesis(projectId, incidentId, input);
      const before = yield* getRecord(projectId, incidentId);
      if (before.incident.status !== "open") return yield* closedIncident();
      if (
        input.hypothesisId !== undefined &&
        !before.hypotheses.some((item) => item.id === input.hypothesisId)
      ) {
        return yield* new EntityNotFound({
          entity: "hypothesis",
          id: input.hypothesisId,
          message: "Hypothesis not found",
        });
      }
      const result = yield* fromMutationRepository(
        repository.upsertHypothesis(projectId, incidentId, {
          id: input.hypothesisId ?? null,
          text: input.text,
          status: input.status,
        }),
      );
      if (Option.isNone(result)) {
        return yield* new EntityNotFound({
          entity: "hypothesis",
          id: input.hypothesisId ?? incidentId,
          message: "Hypothesis not found",
        });
      }
      const after = yield* getRecord(projectId, incidentId);
      const mutationAt = DateTime.toEpochMillis(result.value.updatedAt);
      const timelineEntry = after.timeline.findLast(
        (entry) =>
          entry._tag === "hypothesis" &&
          entry.hypothesisId === result.value.id &&
          entry.status === result.value.status &&
          DateTime.toEpochMillis(entry.occurredAt) === mutationAt,
      );
      yield* publishIncident(projectId, after.incident, "updated");
      yield* publishTimeline(projectId, timelineEntry);
      return result.value;
    });

    const addNote = Effect.fn("IncidentServiceLive.addNote")(function* (
      projectId: ProjectId,
      incidentId: IncidentId,
      text: NonEmptyText,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.addNote(projectId, incidentId, text);
      const before = yield* getRecord(projectId, incidentId);
      if (before.incident.status !== "open") return yield* closedIncident();
      const entry = yield* fromMutationRepository(repository.addNote(projectId, incidentId, text));
      if (entry._tag !== "note") {
        return yield* new ServiceUnavailable({
          service: "postgres",
          message: "Timeline repository returned an invalid note entry",
        });
      }
      yield* publishTimeline(projectId, entry);
      return entry;
    });

    const close = Effect.fn("IncidentServiceLive.close")(function* (
      projectId: ProjectId,
      incidentId: IncidentId,
      summary: NonEmptyText,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.close(projectId, incidentId, summary);
      const before = yield* getRecord(projectId, incidentId);
      if (before.incident.status !== "open") return yield* closedIncident();
      const closed = yield* fromMutationRepository(
        repository.close(projectId, incidentId, summary),
      );
      if (Option.isNone(closed)) return yield* closedIncident();
      const record = yield* getRecord(projectId, incidentId);
      const detail = toDetail(record);
      const closedAt = closed.value.closedAt;
      const timelineEntry =
        closedAt === null
          ? undefined
          : record.timeline.findLast(
              (entry) =>
                entry._tag === "incident-status" &&
                entry.status === "closed" &&
                entry.summary === summary &&
                DateTime.toEpochMillis(entry.occurredAt) === DateTime.toEpochMillis(closedAt),
            );
      yield* publishIncident(projectId, detail.incident, "closed");
      yield* publishTimeline(projectId, timelineEntry);
      return detail;
    });

    return IncidentService.of({
      listAlerts,
      getOpenIncident,
      listIncidents,
      getDetail,
      openIncident,
      ensureIncident,
      setHypothesis,
      addNote,
      close,
    });
  }),
);
