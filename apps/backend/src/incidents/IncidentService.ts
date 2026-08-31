import {
  IncidentChanged,
  IncidentDetail,
  LiveEventId,
  ServiceUnavailable,
  TimelineEntryAdded,
} from "@groundtruth/api-contract";
import {
  EntityNotFound,
  Hypothesis,
  HypothesisId,
  Incident,
  type IncidentId,
  IncidentId as IncidentIdSchema,
  type IncidentTitle,
  InvalidStateTransition,
  type NonEmptyText,
  type ProjectId,
  QuotaExceeded,
  ResourceConflict,
  TimelineHypothesis,
  TimelineIncidentStatus,
  TimelineNote,
  TimelineEntryId,
} from "@groundtruth/domain";
import { Context, Crypto, DateTime, Effect, Layer, Ref } from "effect";
import { LiveEventBus } from "../live/LiveEventBus.js";
import {
  appendTimeline,
  closeIncident as closeIncidentCopy,
  markAlertFiring,
  markAlertResolved,
  touchIncident,
} from "./IncidentCopies.js";
import {
  incidentHypothesisQuota,
  incidentTextQuota,
  incidentTimelineQuotaBeforeClose,
  incidentTimelineQuotaForClose,
} from "./IncidentHistoryPolicy.js";
import type {
  CloseOutcome,
  HypothesisInput,
  HypothesisOutcome,
  IncidentMutation,
  NoteOutcome,
} from "./IncidentMutation.js";
import {
  type AlertFilter,
  findProjectIncident,
  getProjectOpenIncident,
  listProjectAlerts,
  listProjectIncidents,
} from "./IncidentQueries.js";
import {
  emptyProjectIncidentState,
  IncidentState,
  type ProjectIncidentState,
  withProjectIncidentState,
} from "./IncidentState.js";

export type { AlertFilter } from "./IncidentQueries.js";

export class IncidentService extends Context.Service<
  IncidentService,
  {
    listAlerts(
      projectId: ProjectId,
      filter: AlertFilter,
    ): Effect.Effect<ReadonlyArray<ProjectIncidentState["alerts"][number]>, ServiceUnavailable>;
    getOpenIncident(projectId: ProjectId): Effect.Effect<Incident | null, ServiceUnavailable>;
    listIncidents(projectId: ProjectId): Effect.Effect<ReadonlyArray<Incident>, ServiceUnavailable>;
    getDetail(
      projectId: ProjectId,
      incidentId: IncidentId,
    ): Effect.Effect<IncidentDetail, EntityNotFound | ServiceUnavailable>;
    openIncident(
      projectId: ProjectId,
      title: IncidentTitle,
    ): Effect.Effect<IncidentDetail, ResourceConflict | ServiceUnavailable>;
    ensureIncident(
      projectId: ProjectId,
      title: IncidentTitle,
    ): Effect.Effect<IncidentMutation, ServiceUnavailable>;
    setHypothesis(
      projectId: ProjectId,
      incidentId: IncidentId,
      input: HypothesisInput,
    ): Effect.Effect<
      Hypothesis,
      EntityNotFound | InvalidStateTransition | QuotaExceeded | ServiceUnavailable
    >;
    addNote(
      projectId: ProjectId,
      incidentId: IncidentId,
      text: NonEmptyText,
    ): Effect.Effect<
      TimelineNote,
      EntityNotFound | InvalidStateTransition | QuotaExceeded | ServiceUnavailable
    >;
    close(
      projectId: ProjectId,
      incidentId: IncidentId,
      summary: NonEmptyText,
    ): Effect.Effect<
      IncidentDetail,
      EntityNotFound | InvalidStateTransition | QuotaExceeded | ServiceUnavailable
    >;
  }
>()("groundtruth/backend/incidents/IncidentService") {
  static readonly layer = Layer.effect(
    IncidentService,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const store = yield* IncidentState;
      const events = yield* LiveEventBus;

      const listAlerts = Effect.fn("IncidentService.listAlerts")(function* (
        projectId: ProjectId,
        filter: AlertFilter,
      ) {
        return listProjectAlerts(yield* Ref.get(store.state), projectId, filter);
      });

      const getOpenIncident = Effect.fn("IncidentService.getOpenIncident")(function* (
        projectId: ProjectId,
      ) {
        return getProjectOpenIncident(yield* Ref.get(store.state), projectId);
      });

      const listIncidents = Effect.fn("IncidentService.listIncidents")(function* (
        projectId: ProjectId,
      ) {
        return listProjectIncidents(yield* Ref.get(store.state), projectId);
      });

      const getDetail = Effect.fn("IncidentService.getDetail")(function* (
        projectId: ProjectId,
        incidentId: IncidentId,
      ) {
        const detail = findProjectIncident(yield* Ref.get(store.state), projectId, incidentId);
        if (detail === undefined) {
          return yield* new EntityNotFound({
            entity: "incident",
            id: incidentId,
            message: "Incident not found",
          });
        }
        return detail;
      });

      const createIncident = Effect.fn("IncidentService.createIncident")(function* (
        projectId: ProjectId,
        title: IncidentTitle,
        idempotent: boolean,
      ) {
        const now = yield* DateTime.now;
        const incidentId = IncidentIdSchema.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const liveEventId = LiveEventId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const result = yield* Ref.modify<
          ReadonlyMap<ProjectId, ProjectIncidentState>,
          IncidentMutation | null
        >(store.state, (all) => {
          const project = all.get(projectId) ?? emptyProjectIncidentState;
          if (project.detail?.incident.status === "open") {
            return [idempotent ? { detail: project.detail, changed: false } : null, all];
          }
          const incident = new Incident({
            id: incidentId,
            projectId,
            title,
            status: "open",
            summary: null,
            openedAt: now,
            closedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          const detail = new IncidentDetail({
            incident,
            hypotheses: [],
            timeline: [],
          });
          const alerts = project.alerts.map((alert) => markAlertFiring(alert, now));
          const history =
            project.detail === null ? project.history : [...project.history, project.detail];
          return [
            { detail, changed: true },
            withProjectIncidentState(all, projectId, {
              detail,
              history,
              alerts,
              manualAlerts: project.manualAlerts,
            }),
          ];
        });
        if (result === null) {
          return yield* new ResourceConflict({
            resource: "incident",
            message: "A project can have only one open incident",
          });
        }
        if (result.changed) {
          yield* events.publish(
            new IncidentChanged({
              eventId: liveEventId,
              projectId,
              occurredAt: now,
              incident: result.detail.incident,
              change: "opened",
            }),
          );
        }
        return result;
      });

      const openIncident = Effect.fn("IncidentService.openIncident")(
        (projectId: ProjectId, title: IncidentTitle) =>
          createIncident(projectId, title, false).pipe(Effect.map((result) => result.detail)),
      );

      const ensureIncident = Effect.fn("IncidentService.ensureIncident")(
        (projectId: ProjectId, title: IncidentTitle) =>
          createIncident(projectId, title, true).pipe(Effect.orDie),
      );

      const setHypothesis = Effect.fn("IncidentService.setHypothesis")(function* (
        projectId: ProjectId,
        incidentId: IncidentId,
        input: HypothesisInput,
      ) {
        const textQuota = incidentTextQuota(input.text);
        if (textQuota !== null) return yield* Effect.fail(textQuota);
        const now = yield* DateTime.now;
        const hypothesisId =
          input.hypothesisId ?? HypothesisId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const timelineId = TimelineEntryId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const incidentEventId = LiveEventId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const timelineEventId = LiveEventId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const updated = yield* Ref.modify<
          ReadonlyMap<ProjectId, ProjectIncidentState>,
          HypothesisOutcome
        >(store.state, (all) => {
          const project = all.get(projectId);
          const detail = project?.detail;
          if (
            project === undefined ||
            detail === null ||
            detail === undefined ||
            detail.incident.id !== incidentId
          ) {
            return ["missing-incident", all];
          }
          if (detail.incident.status !== "open") {
            return ["closed", all];
          }
          const timelineQuota = incidentTimelineQuotaBeforeClose(detail);
          if (timelineQuota !== null) return [timelineQuota, all];
          const previous = detail.hypotheses.find((item) => item.id === hypothesisId);
          if (input.hypothesisId !== undefined && previous === undefined) {
            return ["missing-hypothesis", all];
          }
          if (previous === undefined) {
            const hypothesisQuota = incidentHypothesisQuota(detail);
            if (hypothesisQuota !== null) return [hypothesisQuota, all];
          }
          const hypothesis = new Hypothesis({
            id: hypothesisId,
            projectId,
            incidentId,
            text: input.text,
            status: input.status,
            createdAt: previous?.createdAt ?? now,
            updatedAt: now,
          });
          const hypotheses =
            previous === undefined
              ? [...detail.hypotheses, hypothesis]
              : detail.hypotheses.map((item) => (item.id === hypothesis.id ? hypothesis : item));
          const entry = new TimelineHypothesis({
            id: timelineId,
            projectId,
            incidentId,
            occurredAt: now,
            hypothesisId,
            text: input.text,
            status: input.status,
          });
          const incident = touchIncident(detail.incident, now);
          const nextDetail = new IncidentDetail({
            incident,
            hypotheses,
            timeline: [...detail.timeline, entry],
          });
          return [
            { hypothesis, entry, incident },
            withProjectIncidentState(all, projectId, { ...project, detail: nextDetail }),
          ];
        });
        if (updated === "missing-incident" || updated === "missing-hypothesis") {
          return yield* new EntityNotFound({
            entity: updated === "missing-incident" ? "incident" : "hypothesis",
            id: updated === "missing-incident" ? incidentId : hypothesisId,
            message: updated === "missing-incident" ? "Incident not found" : "Hypothesis not found",
          });
        }
        if (updated === "closed") {
          return yield* new InvalidStateTransition({
            resource: "incident",
            from: "closed",
            to: "update hypothesis",
            message: "Closed incidents cannot be changed",
          });
        }
        if (updated instanceof QuotaExceeded) return yield* Effect.fail(updated);
        yield* events.publishAll([
          new IncidentChanged({
            eventId: incidentEventId,
            projectId,
            occurredAt: now,
            incident: updated.incident,
            change: "updated",
          }),
          new TimelineEntryAdded({
            eventId: timelineEventId,
            projectId,
            occurredAt: now,
            entry: updated.entry,
          }),
        ]);
        return updated.hypothesis;
      });

      const addNote = Effect.fn("IncidentService.addNote")(function* (
        projectId: ProjectId,
        incidentId: IncidentId,
        text: NonEmptyText,
      ) {
        const textQuota = incidentTextQuota(text);
        if (textQuota !== null) return yield* Effect.fail(textQuota);
        const now = yield* DateTime.now;
        const entry = new TimelineNote({
          id: TimelineEntryId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie)),
          projectId,
          incidentId,
          occurredAt: now,
          text,
        });
        const liveEventId = LiveEventId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const outcome = yield* Ref.modify<
          ReadonlyMap<ProjectId, ProjectIncidentState>,
          NoteOutcome
        >(store.state, (all) => {
          const project = all.get(projectId);
          const detail = project?.detail;
          if (
            project === undefined ||
            detail === null ||
            detail === undefined ||
            detail.incident.id !== incidentId
          ) {
            return ["missing", all];
          }
          if (detail.incident.status !== "open") {
            return ["closed", all];
          }
          const timelineQuota = incidentTimelineQuotaBeforeClose(detail);
          if (timelineQuota !== null) return [timelineQuota, all];
          const nextDetail = appendTimeline(detail, entry);
          return [
            entry,
            withProjectIncidentState(all, projectId, { ...project, detail: nextDetail }),
          ];
        });
        if (outcome === "missing") {
          return yield* new EntityNotFound({
            entity: "incident",
            id: incidentId,
            message: "Incident not found",
          });
        }
        if (outcome === "closed") {
          return yield* new InvalidStateTransition({
            resource: "incident",
            from: "closed",
            to: "add timeline note",
            message: "Closed incidents cannot be changed",
          });
        }
        if (outcome instanceof QuotaExceeded) return yield* Effect.fail(outcome);
        yield* events.publish(
          new TimelineEntryAdded({
            eventId: liveEventId,
            projectId,
            occurredAt: now,
            entry: outcome,
          }),
        );
        return outcome;
      });

      const close = Effect.fn("IncidentService.close")(function* (
        projectId: ProjectId,
        incidentId: IncidentId,
        summary: NonEmptyText,
      ) {
        const textQuota = incidentTextQuota(summary);
        if (textQuota !== null) return yield* Effect.fail(textQuota);
        const now = yield* DateTime.now;
        const entry = new TimelineIncidentStatus({
          id: TimelineEntryId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie)),
          projectId,
          incidentId,
          occurredAt: now,
          status: "closed",
          summary,
        });
        const incidentEventId = LiveEventId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const timelineEventId = LiveEventId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie));
        const outcome = yield* Ref.modify<
          ReadonlyMap<ProjectId, ProjectIncidentState>,
          CloseOutcome
        >(store.state, (all) => {
          const project = all.get(projectId);
          const detail = project?.detail;
          if (
            project === undefined ||
            detail === null ||
            detail === undefined ||
            detail.incident.id !== incidentId
          ) {
            return ["missing", all];
          }
          if (detail.incident.status === "closed") {
            return ["closed", all];
          }
          const timelineQuota = incidentTimelineQuotaForClose(detail);
          if (timelineQuota !== null) return [timelineQuota, all];
          const incident = closeIncidentCopy(detail.incident, summary, now);
          const nextDetail = appendTimeline(detail, entry, incident);
          const alerts = project.alerts.map((alert) => markAlertResolved(alert, now));
          return [
            nextDetail,
            withProjectIncidentState(all, projectId, {
              detail: nextDetail,
              history: project.history,
              alerts,
              manualAlerts: project.manualAlerts,
            }),
          ];
        });
        if (outcome === "missing") {
          return yield* new EntityNotFound({
            entity: "incident",
            id: incidentId,
            message: "Incident not found",
          });
        }
        if (outcome === "closed") {
          return yield* new InvalidStateTransition({
            resource: "incident",
            from: "closed",
            to: "closed",
            message: "Incident is already closed",
          });
        }
        if (outcome instanceof QuotaExceeded) return yield* Effect.fail(outcome);
        yield* events.publishAll([
          new IncidentChanged({
            eventId: incidentEventId,
            projectId,
            occurredAt: now,
            incident: outcome.incident,
            change: "closed",
          }),
          new TimelineEntryAdded({
            eventId: timelineEventId,
            projectId,
            occurredAt: now,
            entry,
          }),
        ]);
        return outcome;
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
}
