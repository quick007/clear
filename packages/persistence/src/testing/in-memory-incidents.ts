import {
  DeployEvent,
  Hypothesis,
  Incident,
  TimelineDeploy,
  TimelineHypothesis,
  TimelineIncidentStatus,
  TimelineNote,
  type IncidentId,
  type ProjectId,
  type TimelineEntry,
} from "@groundtruth/domain";
import { DateTime, Effect, Layer, Option, Ref } from "effect";
import { persistenceError, repositoryConflict, repositoryQuotaExceeded } from "../errors.ts";
import type { IdGeneratorShape } from "../ids.ts";
import {
  IncidentHistoryLimits,
  incidentTextCodePointLength,
  incidentTextIsWithinLimit,
} from "../repositories/incident-policy.ts";
import { DeployEventRepository, IncidentRepository } from "../repositories/services.ts";
import { appendMemoryOutbox, type RepositoriesMemoryState, updateMap } from "./in-memory-state.ts";

const active = (state: RepositoriesMemoryState, projectId: ProjectId) =>
  state.projects.get(projectId)?.lifecycle === "active";

const failure = (operation: string, message: string) =>
  persistenceError("postgres", operation, message, false);

const chronological = <Value extends { readonly id: unknown }>(
  values: ReadonlyArray<Value>,
  occurredAt: (value: Value) => DateTime.Utc,
) =>
  [...values].sort(
    (left, right) =>
      DateTime.toEpochMillis(occurredAt(left)) - DateTime.toEpochMillis(occurredAt(right)) ||
      String(left.id).localeCompare(String(right.id)),
  );

const latestTimeline = (values: ReadonlyArray<TimelineEntry>) =>
  values
    .slice(-IncidentHistoryLimits.timelineEntries)
    .toSorted(
      (left, right) =>
        DateTime.toEpochMillis(left.occurredAt) - DateTime.toEpochMillis(right.occurredAt),
    );

const latestHypotheses = (values: ReadonlyArray<Hypothesis>) =>
  chronological(
    [...values]
      .sort(
        (left, right) =>
          DateTime.toEpochMillis(right.updatedAt) - DateTime.toEpochMillis(left.updatedAt) ||
          String(right.id).localeCompare(String(left.id)),
      )
      .slice(0, IncidentHistoryLimits.hypotheses),
    (hypothesis) => hypothesis.createdAt,
  );

const timelineSize = (state: RepositoriesMemoryState, incidentId: IncidentId) =>
  state.timelines.get(incidentId)?.length ?? 0;

const textQuota = (text: string) =>
  repositoryQuotaExceeded(
    "incident-text",
    IncidentHistoryLimits.textCodePoints,
    incidentTextCodePointLength(text),
  );
const timelineQuota = (limit: number, observed: number) =>
  repositoryQuotaExceeded("incident-timeline", limit, observed);
const hypothesesQuota = (observed: number) =>
  repositoryQuotaExceeded("incident-hypotheses", IncidentHistoryLimits.hypotheses, observed);

type AddNoteResult =
  | { readonly _tag: "conflict" }
  | { readonly _tag: "quota"; readonly observed: number }
  | { readonly _tag: "ok"; readonly entry: TimelineEntry };

type UpsertHypothesisResult =
  | { readonly _tag: "conflict" }
  | { readonly _tag: "timeline-quota"; readonly observed: number }
  | { readonly _tag: "hypothesis-quota"; readonly observed: number }
  | { readonly _tag: "ok"; readonly hypothesis: Option.Option<Hypothesis> };

type CloseIncidentResult =
  | { readonly _tag: "missing" }
  | { readonly _tag: "quota"; readonly observed: number }
  | { readonly _tag: "ok"; readonly incident: Option.Option<Incident> };

const addTimelineEntry = (
  state: RepositoriesMemoryState,
  incidentId: IncidentId,
  entry: TimelineEntry,
) => ({
  ...state,
  timelines: updateMap(state.timelines, incidentId, [
    ...(state.timelines.get(incidentId) ?? []),
    entry,
  ]),
});

export const makeIncidentRepositoriesMemory = (
  state: Ref.Ref<RepositoriesMemoryState>,
  ids: IdGeneratorShape,
) => {
  const incidentRepository = IncidentRepository.of({
    open: (projectId, input) =>
      Effect.gen(function* () {
        const id = yield* ids.incident;
        const entryId = yield* ids.timelineEntry;
        const now = yield* DateTime.now;
        const result = yield* Ref.modify(state, (current) => {
          if (!active(current, projectId)) return [Option.none(), current];
          const incident = new Incident({
            id,
            projectId,
            title: input.title,
            status: "open",
            summary: null,
            openedAt: now,
            closedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          const entry = new TimelineIncidentStatus({
            id: entryId,
            projectId,
            incidentId: id,
            occurredAt: now,
            status: "open",
            summary: null,
          });
          const withIncident = addTimelineEntry(
            { ...current, incidents: updateMap(current.incidents, id, incident) },
            id,
            entry,
          );
          const withEvent = appendMemoryOutbox(
            withIncident,
            projectId,
            "incident.opened",
            { incidentId: id },
            now,
          ).state;
          return [Option.some(incident), withEvent];
        });
        return yield* Option.match(result, {
          onNone: () => Effect.fail(failure("open-incident", "active project does not exist")),
          onSome: Effect.succeed,
        });
      }),
    findOpen: (projectId) =>
      Ref.get(state).pipe(
        Effect.map(({ incidents }) =>
          Option.fromNullishOr(
            [...incidents.values()]
              .filter((incident) => incident.projectId === projectId && incident.status === "open")
              .sort(
                (left, right) =>
                  DateTime.toEpochMillis(right.openedAt) - DateTime.toEpochMillis(left.openedAt),
              )[0],
          ),
        ),
      ),
    getDetail: (projectId, incidentId) =>
      Ref.get(state).pipe(
        Effect.map((current) => {
          const incident = current.incidents.get(incidentId);
          if (incident?.projectId !== projectId) return Option.none();
          return Option.some({
            incident,
            hypotheses: latestHypotheses(
              [...current.hypotheses.values()].filter(
                (hypothesis) =>
                  hypothesis.projectId === projectId && hypothesis.incidentId === incidentId,
              ),
            ),
            timeline: latestTimeline(current.timelines.get(incidentId) ?? []),
          });
        }),
      ),
    list: (projectId) =>
      Ref.get(state).pipe(
        Effect.map(({ incidents }) =>
          [...incidents.values()]
            .filter((incident) => incident.projectId === projectId)
            .sort(
              (left, right) =>
                DateTime.toEpochMillis(right.openedAt) - DateTime.toEpochMillis(left.openedAt),
            )
            .slice(0, 100),
        ),
      ),
    listTimeline: (projectId, incidentId) =>
      Ref.get(state).pipe(
        Effect.map((current) => {
          const incident = current.incidents.get(incidentId);
          if (incident?.projectId !== projectId) return [];
          return latestTimeline(current.timelines.get(incidentId) ?? []);
        }),
      ),
    addNote: (projectId, incidentId, text) =>
      Effect.gen(function* () {
        if (!incidentTextIsWithinLimit(text)) {
          return yield* Effect.fail(textQuota(text));
        }
        const id = yield* ids.timelineEntry;
        const now = yield* DateTime.now;
        const result = yield* Ref.modify<RepositoriesMemoryState, AddNoteResult>(
          state,
          (current) => {
            const incident = current.incidents.get(incidentId);
            if (incident?.projectId !== projectId || incident.status !== "open") {
              return [{ _tag: "conflict" as const }, current];
            }
            if (
              timelineSize(current, incidentId) >= IncidentHistoryLimits.timelineEntriesBeforeClose
            ) {
              return [
                { _tag: "quota" as const, observed: timelineSize(current, incidentId) + 1 },
                current,
              ];
            }
            const entry = new TimelineNote({ id, projectId, incidentId, occurredAt: now, text });
            const withEntry = addTimelineEntry(current, incidentId, entry);
            const withEvent = appendMemoryOutbox(
              withEntry,
              projectId,
              "timeline.entry_added",
              { incidentId, entryId: id, kind: "note" },
              now,
            ).state;
            return [{ _tag: "ok" as const, entry }, withEvent];
          },
        );
        if (result._tag === "conflict") {
          return yield* Effect.fail(repositoryConflict("incident-not-open"));
        }
        if (result._tag === "quota") {
          return yield* Effect.fail(
            timelineQuota(IncidentHistoryLimits.timelineEntriesBeforeClose, result.observed),
          );
        }
        return result.entry;
      }),
    upsertHypothesis: (projectId, incidentId, input) =>
      Effect.gen(function* () {
        if (!incidentTextIsWithinLimit(input.text)) {
          return yield* Effect.fail(textQuota(input.text));
        }
        const generatedId = yield* ids.hypothesis;
        const entryId = yield* ids.timelineEntry;
        const now = yield* DateTime.now;
        const result = yield* Ref.modify<RepositoriesMemoryState, UpsertHypothesisResult>(
          state,
          (current) => {
            const incident = current.incidents.get(incidentId);
            if (incident?.projectId !== projectId || incident.status !== "open") {
              return [{ _tag: "conflict" as const }, current];
            }
            if (
              timelineSize(current, incidentId) >= IncidentHistoryLimits.timelineEntriesBeforeClose
            ) {
              return [
                {
                  _tag: "timeline-quota" as const,
                  observed: timelineSize(current, incidentId) + 1,
                },
                current,
              ];
            }
            const existing = input.id === null ? undefined : current.hypotheses.get(input.id);
            if (
              input.id !== null &&
              (existing?.projectId !== projectId || existing.incidentId !== incidentId)
            ) {
              return [{ _tag: "ok" as const, hypothesis: Option.none() }, current];
            }
            const hypothesesCount = [...current.hypotheses.values()].filter(
              (hypothesis) =>
                hypothesis.projectId === projectId && hypothesis.incidentId === incidentId,
            ).length;
            if (input.id === null && hypothesesCount >= IncidentHistoryLimits.hypotheses) {
              return [
                { _tag: "hypothesis-quota" as const, observed: hypothesesCount + 1 },
                current,
              ];
            }
            const hypothesis = new Hypothesis({
              id: existing?.id ?? generatedId,
              projectId,
              incidentId,
              text: input.text,
              status: input.status,
              createdAt: existing?.createdAt ?? now,
              updatedAt: now,
            });
            const entry = new TimelineHypothesis({
              id: entryId,
              projectId,
              incidentId,
              occurredAt: now,
              hypothesisId: hypothesis.id,
              text: hypothesis.text,
              status: hypothesis.status,
            });
            const withHypothesis = addTimelineEntry(
              {
                ...current,
                hypotheses: updateMap(current.hypotheses, hypothesis.id, hypothesis),
              },
              incidentId,
              entry,
            );
            const withEvent = appendMemoryOutbox(
              withHypothesis,
              projectId,
              "hypothesis.changed",
              { incidentId, hypothesisId: hypothesis.id, status: hypothesis.status },
              now,
            ).state;
            return [{ _tag: "ok" as const, hypothesis: Option.some(hypothesis) }, withEvent];
          },
        );
        if (result._tag === "conflict") {
          return yield* Effect.fail(repositoryConflict("incident-not-open"));
        }
        if (result._tag === "timeline-quota") {
          return yield* Effect.fail(
            timelineQuota(IncidentHistoryLimits.timelineEntriesBeforeClose, result.observed),
          );
        }
        if (result._tag === "hypothesis-quota") {
          return yield* Effect.fail(hypothesesQuota(result.observed));
        }
        return result.hypothesis;
      }),
    close: (projectId, incidentId, summary) =>
      Effect.gen(function* () {
        if (!incidentTextIsWithinLimit(summary)) {
          return yield* Effect.fail(textQuota(summary));
        }
        const entryId = yield* ids.timelineEntry;
        const now = yield* DateTime.now;
        const result = yield* Ref.modify<RepositoriesMemoryState, CloseIncidentResult>(
          state,
          (current) => {
            const existing = current.incidents.get(incidentId);
            if (existing?.projectId !== projectId || existing.status !== "open") {
              return [{ _tag: "missing" as const }, current];
            }
            if (timelineSize(current, incidentId) >= IncidentHistoryLimits.timelineEntries) {
              return [
                { _tag: "quota" as const, observed: timelineSize(current, incidentId) + 1 },
                current,
              ];
            }
            const incident = new Incident({
              id: existing.id,
              projectId: existing.projectId,
              title: existing.title,
              openedAt: existing.openedAt,
              createdAt: existing.createdAt,
              status: "closed",
              summary,
              closedAt: now,
              updatedAt: now,
            });
            const entry = new TimelineIncidentStatus({
              id: entryId,
              projectId,
              incidentId,
              occurredAt: now,
              status: "closed",
              summary,
            });
            const withIncident = addTimelineEntry(
              {
                ...current,
                incidents: updateMap(current.incidents, incidentId, incident),
              },
              incidentId,
              entry,
            );
            const withEvent = appendMemoryOutbox(
              withIncident,
              projectId,
              "incident.closed",
              { incidentId },
              now,
            ).state;
            return [{ _tag: "ok" as const, incident: Option.some(incident) }, withEvent];
          },
        );
        if (result._tag === "missing") return Option.none();
        if (result._tag === "quota") {
          return yield* Effect.fail(
            timelineQuota(IncidentHistoryLimits.timelineEntries, result.observed),
          );
        }
        return result.incident;
      }),
  });

  const deployRepository = DeployEventRepository.of({
    record: (projectId, input) =>
      Effect.gen(function* () {
        const id = yield* ids.deployEvent;
        const entryId = yield* ids.timelineEntry;
        const receivedAt = yield* DateTime.now;
        const result = yield* Ref.modify(state, (current) => {
          if (!active(current, projectId)) return [Option.none(), current];
          const deploy = new DeployEvent({ id, projectId, ...input, receivedAt });
          let withDeploy: RepositoriesMemoryState = {
            ...current,
            deployEvents: [...current.deployEvents, deploy],
          };
          const openIncident = [...current.incidents.values()]
            .filter((incident) => incident.projectId === projectId && incident.status === "open")
            .sort(
              (left, right) =>
                DateTime.toEpochMillis(right.openedAt) - DateTime.toEpochMillis(left.openedAt),
            )[0];
          if (
            openIncident !== undefined &&
            timelineSize(current, openIncident.id) <
              IncidentHistoryLimits.timelineEntriesBeforeClose
          ) {
            withDeploy = addTimelineEntry(
              withDeploy,
              openIncident.id,
              new TimelineDeploy({
                id: entryId,
                projectId,
                incidentId: openIncident.id,
                occurredAt: input.deployedAt,
                deployEventId: id,
                serviceName: input.serviceName,
                sha: input.sha,
              }),
            );
          }
          const withEvent = appendMemoryOutbox(
            withDeploy,
            projectId,
            "deploy.recorded",
            { deployEventId: id, serviceName: input.serviceName, sha: input.sha },
            receivedAt,
          ).state;
          return [Option.some(deploy), withEvent];
        });
        return yield* Option.match(result, {
          onNone: () => Effect.fail(failure("record-deploy", "active project does not exist")),
          onSome: Effect.succeed,
        });
      }),
    list: (projectId, query) =>
      Ref.get(state).pipe(
        Effect.map(({ deployEvents }) => {
          const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
          const matching = deployEvents
            .filter(
              (deploy) =>
                deploy.projectId === projectId &&
                DateTime.toEpochMillis(deploy.deployedAt) >= DateTime.toEpochMillis(query.since) &&
                (query.serviceName === undefined || deploy.serviceName === query.serviceName) &&
                (query.before === undefined ||
                  DateTime.toEpochMillis(deploy.deployedAt) <
                    DateTime.toEpochMillis(query.before.deployedAt) ||
                  (DateTime.toEpochMillis(deploy.deployedAt) ===
                    DateTime.toEpochMillis(query.before.deployedAt) &&
                    String(deploy.id) < String(query.before.id))),
            )
            .sort(
              (left, right) =>
                DateTime.toEpochMillis(right.deployedAt) -
                  DateTime.toEpochMillis(left.deployedAt) ||
                String(right.id).localeCompare(String(left.id)),
            )
            .slice(0, limit + 1);
          const hasMore = matching.length > limit;
          const events = matching.slice(0, limit);
          const last = events.at(-1);
          return {
            events,
            hasMore,
            nextCursor:
              hasMore && last !== undefined ? { deployedAt: last.deployedAt, id: last.id } : null,
          };
        }),
      ),
  });

  return Layer.mergeAll(
    Layer.succeed(IncidentRepository, incidentRepository),
    Layer.succeed(DeployEventRepository, deployRepository),
  );
};
