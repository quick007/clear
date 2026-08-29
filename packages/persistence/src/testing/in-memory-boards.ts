import { Alert, DashboardMetadata, PanelMetadata, type ProjectId } from "@groundtruth/domain";
import { DateTime, Effect, Layer, Option, Ref } from "effect";
import { persistenceError } from "../errors.ts";
import type { IdGeneratorShape } from "../ids.ts";
import type { DashboardRecord, PanelRecord } from "../repositories/contracts.ts";
import { AlertRepository, DashboardRepository } from "../repositories/services.ts";
import {
  appendMemoryOutbox,
  type RepositoriesMemoryState,
  removeMap,
  updateMap,
} from "./in-memory-state.ts";
import { makeSeedDashboardIfEmpty } from "./in-memory-board-seed.ts";

const active = (state: RepositoriesMemoryState, projectId: ProjectId) =>
  state.projects.get(projectId)?.lifecycle === "active";

const failure = (operation: string, message: string) =>
  persistenceError("postgres", operation, message, false);

const sortPanels = (panelRecords: ReadonlyArray<PanelRecord>) =>
  [...panelRecords].sort(
    (left, right) =>
      left.metadata.position - right.metadata.position ||
      String(left.metadata.id).localeCompare(String(right.metadata.id)),
  );

const panelAtPosition = (panel: PanelRecord, position: number, now: DateTime.Utc) => {
  if (panel.metadata.position === position) return panel;
  return {
    ...panel,
    metadata: new PanelMetadata({
      id: panel.metadata.id,
      projectId: panel.metadata.projectId,
      dashboardId: panel.metadata.dashboardId,
      title: panel.metadata.title,
      position,
      revision: panel.metadata.revision + 1,
      createdAt: panel.metadata.createdAt,
      updatedAt: now,
    }),
  };
};

const dashboardWithPanels = (
  dashboard: DashboardRecord,
  panelRecords: ReadonlyArray<PanelRecord>,
  now: DateTime.Utc,
): DashboardRecord => ({
  ...dashboard,
  metadata: new DashboardMetadata({
    id: dashboard.metadata.id,
    projectId: dashboard.metadata.projectId,
    name: dashboard.metadata.name,
    description: dashboard.metadata.description,
    createdAt: dashboard.metadata.createdAt,
    updatedAt: now,
  }),
  panels: panelRecords,
});

const appendReorderEvents = (
  state: RepositoriesMemoryState,
  dashboard: DashboardRecord,
  previous: ReadonlyArray<PanelRecord>,
  now: DateTime.Utc,
) => {
  const previousById = new Map(previous.map((panel) => [panel.metadata.id, panel]));
  let next = state;
  for (const panel of dashboard.panels) {
    const prior = previousById.get(panel.metadata.id);
    if (prior === undefined || prior.metadata.revision === panel.metadata.revision) continue;
    next = appendMemoryOutbox(
      next,
      dashboard.metadata.projectId,
      "panel.updated",
      {
        dashboardId: dashboard.metadata.id,
        panelId: panel.metadata.id,
        revision: panel.metadata.revision,
      },
      now,
    ).state;
  }
  return next;
};

export const makeBoardRepositoriesMemory = (
  state: Ref.Ref<RepositoriesMemoryState>,
  ids: IdGeneratorShape,
) => {
  const dashboardRepository = DashboardRepository.of({
    create: (projectId, input) =>
      Effect.gen(function* () {
        const id = yield* ids.dashboard;
        const now = yield* DateTime.now;
        const result = yield* Ref.modify(state, (current) => {
          if (!active(current, projectId)) return [Option.none(), current];
          const dashboards = new Map(current.dashboards);
          if (input.isDefault) {
            for (const [dashboardId, dashboard] of dashboards) {
              if (dashboard.metadata.projectId === projectId && dashboard.isDefault) {
                dashboards.set(dashboardId, {
                  ...dashboard,
                  isDefault: false,
                  metadata: new DashboardMetadata({
                    id: dashboard.metadata.id,
                    projectId: dashboard.metadata.projectId,
                    name: dashboard.metadata.name,
                    description: dashboard.metadata.description,
                    createdAt: dashboard.metadata.createdAt,
                    updatedAt: now,
                  }),
                });
              }
            }
          }
          const dashboard = {
            metadata: new DashboardMetadata({
              id,
              projectId,
              name: input.name,
              description: input.description,
              createdAt: now,
              updatedAt: now,
            }),
            isDefault: input.isDefault,
            panels: [],
          };
          dashboards.set(id, dashboard);
          const withDashboard = { ...current, dashboards };
          const withEvent = appendMemoryOutbox(
            withDashboard,
            projectId,
            "dashboard.created",
            { dashboardId: id },
            now,
          ).state;
          return [Option.some(dashboard), withEvent];
        });
        return yield* Option.match(result, {
          onNone: () => Effect.fail(failure("create-dashboard", "active project does not exist")),
          onSome: Effect.succeed,
        });
      }),
    findById: (projectId, id) =>
      Ref.get(state).pipe(
        Effect.map(({ dashboards }) => {
          const dashboard = dashboards.get(id);
          return Option.fromNullishOr(
            dashboard?.metadata.projectId === projectId ? dashboard : undefined,
          );
        }),
      ),
    list: (projectId) =>
      Ref.get(state).pipe(
        Effect.map(({ dashboards }) =>
          [...dashboards.values()]
            .filter(({ metadata }) => metadata.projectId === projectId)
            .sort(
              (left, right) =>
                DateTime.toEpochMillis(left.metadata.createdAt) -
                DateTime.toEpochMillis(right.metadata.createdAt),
            )
            .slice(0, 100),
        ),
      ),
    seedIfEmpty: makeSeedDashboardIfEmpty(state, ids),
    addPanel: (projectId, input) =>
      Effect.gen(function* () {
        const id = yield* ids.panel;
        const now = yield* DateTime.now;
        const result = yield* Ref.modify(state, (current) => {
          const dashboard = current.dashboards.get(input.dashboardId);
          if (!active(current, projectId) || dashboard?.metadata.projectId !== projectId) {
            return [Option.none(), current];
          }
          const ordered = sortPanels(dashboard.panels);
          const position = Math.min(Math.max(input.position, 0), ordered.length);
          const panel: PanelRecord = {
            metadata: new PanelMetadata({
              id,
              projectId,
              dashboardId: input.dashboardId,
              title: input.title,
              position,
              revision: 0,
              createdAt: now,
              updatedAt: now,
            }),
            spec: input.spec,
            annotations: [],
          };
          ordered.splice(position, 0, panel);
          const updatedDashboard = dashboardWithPanels(
            dashboard,
            ordered.map((entry, index) => panelAtPosition(entry, index, now)),
            now,
          );
          const withPanel = appendReorderEvents(
            {
              ...current,
              dashboards: updateMap(current.dashboards, input.dashboardId, updatedDashboard),
            },
            updatedDashboard,
            dashboard.panels,
            now,
          );
          const withEvent = appendMemoryOutbox(
            withPanel,
            projectId,
            "panel.created",
            { dashboardId: input.dashboardId, panelId: id },
            now,
          ).state;
          return [Option.some(panel), withEvent];
        });
        return yield* Option.match(result, {
          onNone: () =>
            Effect.fail(failure("create-panel", "dashboard is outside the active project")),
          onSome: Effect.succeed,
        });
      }),
    updatePanel: (projectId, panelId, input) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        return yield* Ref.modify(state, (current) => {
          if (!active(current, projectId)) return [Option.none(), current];
          const dashboard = [...current.dashboards.values()].find(
            ({ metadata, panels }) =>
              metadata.projectId === projectId &&
              panels.some(({ metadata: panel }) => panel.id === panelId),
          );
          const panel = dashboard?.panels.find(({ metadata }) => metadata.id === panelId);
          if (dashboard === undefined || panel?.metadata.revision !== input.expectedRevision) {
            return [Option.none(), current];
          }
          const siblings = sortPanels(
            dashboard.panels.filter(({ metadata }) => metadata.id !== panelId),
          );
          const position = Math.min(Math.max(input.position, 0), siblings.length);
          const updated: PanelRecord = {
            metadata: new PanelMetadata({
              id: panel.metadata.id,
              projectId: panel.metadata.projectId,
              dashboardId: panel.metadata.dashboardId,
              createdAt: panel.metadata.createdAt,
              title: input.title,
              position,
              revision: input.expectedRevision + 1,
              updatedAt: now,
            }),
            spec: input.spec,
            annotations: panel.annotations,
          };
          siblings.splice(position, 0, updated);
          const updatedDashboard = dashboardWithPanels(
            dashboard,
            siblings.map((entry, index) => panelAtPosition(entry, index, now)),
            now,
          );
          const persistedUpdated = updatedDashboard.panels.find(
            ({ metadata }) => metadata.id === panelId,
          )!;
          const withPanel = appendReorderEvents(
            {
              ...current,
              dashboards: updateMap(current.dashboards, dashboard.metadata.id, updatedDashboard),
            },
            updatedDashboard,
            dashboard.panels,
            now,
          );
          return [Option.some(persistedUpdated), withPanel];
        });
      }),
    annotatePanel: (projectId, panelId, annotation) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        return yield* Ref.modify(state, (current) => {
          if (!active(current, projectId)) return [Option.none(), current];
          const dashboard = [...current.dashboards.values()].find(
            ({ metadata, panels }) =>
              metadata.projectId === projectId &&
              panels.some(({ metadata: panel }) => panel.id === panelId),
          );
          const panel = dashboard?.panels.find(({ metadata }) => metadata.id === panelId);
          if (dashboard === undefined || panel === undefined) return [Option.none(), current];
          const updated = {
            metadata: new PanelMetadata({
              id: panel.metadata.id,
              projectId: panel.metadata.projectId,
              dashboardId: panel.metadata.dashboardId,
              title: panel.metadata.title,
              position: panel.metadata.position,
              createdAt: panel.metadata.createdAt,
              revision: panel.metadata.revision + 1,
              updatedAt: now,
            }),
            spec: panel.spec,
            annotations: [...panel.annotations, annotation],
          };
          const updatedDashboard = dashboardWithPanels(
            dashboard,
            dashboard.panels.map((entry) => (entry.metadata.id === panelId ? updated : entry)),
            now,
          );
          const withPanel = {
            ...current,
            dashboards: updateMap(current.dashboards, dashboard.metadata.id, updatedDashboard),
          };
          const withEvent = appendMemoryOutbox(
            withPanel,
            projectId,
            "panel.updated",
            {
              dashboardId: dashboard.metadata.id,
              panelId,
              revision: updated.metadata.revision,
              annotationKind: annotation._tag,
            },
            now,
          ).state;
          return [Option.some(updated), withEvent];
        });
      }),
    removePanel: (projectId, panelId) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        return yield* Ref.modify(state, (current) => {
          const dashboard = [...current.dashboards.values()].find(
            ({ metadata, panels }) =>
              metadata.projectId === projectId &&
              panels.some(({ metadata: panel }) => panel.id === panelId),
          );
          if (dashboard === undefined) return [false, current];
          const remaining = sortPanels(
            dashboard.panels.filter(({ metadata }) => metadata.id !== panelId),
          );
          const updatedDashboard = dashboardWithPanels(
            dashboard,
            remaining.map((entry, index) => panelAtPosition(entry, index, now)),
            now,
          );
          const withPanel = appendReorderEvents(
            {
              ...current,
              dashboards: updateMap(current.dashboards, dashboard.metadata.id, updatedDashboard),
            },
            updatedDashboard,
            dashboard.panels,
            now,
          );
          const withEvent = appendMemoryOutbox(
            withPanel,
            projectId,
            "panel.removed",
            { dashboardId: dashboard.metadata.id, panelId },
            now,
          ).state;
          return [true, withEvent];
        });
      }),
  });

  const alertRepository = AlertRepository.of({
    count: (projectId) =>
      Ref.get(state).pipe(
        Effect.map(
          ({ alerts }) =>
            [...alerts.values()].filter((alert) => alert.projectId === projectId).length,
        ),
      ),
    create: (projectId, input) =>
      Effect.gen(function* () {
        const id = yield* ids.alert;
        const now = yield* DateTime.now;
        const result = yield* Ref.modify(state, (current) => {
          if (!active(current, projectId)) return [Option.none(), current];
          const alert = new Alert({
            id,
            projectId,
            ...input,
            status: "healthy",
            firingSince: null,
            resolvedAt: null,
            createdAt: now,
            updatedAt: now,
          });
          const withAlert = { ...current, alerts: updateMap(current.alerts, id, alert) };
          const withEvent = appendMemoryOutbox(
            withAlert,
            projectId,
            "alert.created",
            { alertId: id },
            now,
          ).state;
          return [Option.some(alert), withEvent];
        });
        return yield* Option.match(result, {
          onNone: () => Effect.fail(failure("create-alert", "active project does not exist")),
          onSome: Effect.succeed,
        });
      }),
    list: (projectId) =>
      Ref.get(state).pipe(
        Effect.map(({ alerts }) =>
          [...alerts.values()]
            .filter((alert) => alert.projectId === projectId)
            .sort(
              (left, right) =>
                DateTime.toEpochMillis(right.createdAt) - DateTime.toEpochMillis(left.createdAt),
            )
            .slice(0, 100),
        ),
      ),
    findById: (projectId, id) =>
      Ref.get(state).pipe(
        Effect.map(({ alerts }) => {
          const alert = alerts.get(id);
          return Option.fromNullishOr(alert?.projectId === projectId ? alert : undefined);
        }),
      ),
    updateState: (projectId, id, input) =>
      Ref.modify(state, (current) => {
        const existing = current.alerts.get(id);
        if (existing?.projectId !== projectId) return [Option.none(), current];
        const alert = new Alert({
          id: existing.id,
          projectId: existing.projectId,
          name: existing.name,
          serviceName: existing.serviceName,
          metricName: existing.metricName,
          aggregation: existing.aggregation,
          comparison: existing.comparison,
          threshold: existing.threshold,
          windowSeconds: existing.windowSeconds,
          severity: existing.severity,
          enabled: existing.enabled,
          createdAt: existing.createdAt,
          ...input,
        });
        const withAlert = {
          ...current,
          alerts: updateMap(current.alerts, id, alert),
        };
        const withEvent = appendMemoryOutbox(
          withAlert,
          projectId,
          "alert.state_changed",
          {
            alertId: id,
            status: alert.status,
            updatedAt: DateTime.formatIso(input.updatedAt),
          },
          input.updatedAt,
        ).state;
        return [Option.some(alert), withEvent];
      }),
    delete: (projectId, id) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        return yield* Ref.modify(state, (current) => {
          const existing = current.alerts.get(id);
          if (existing?.projectId !== projectId) return [false, current];
          const withoutAlert = { ...current, alerts: removeMap(current.alerts, id) };
          const withEvent = appendMemoryOutbox(
            withoutAlert,
            projectId,
            "alert.updated",
            { alertId: id, deleted: true },
            now,
          ).state;
          return [true, withEvent];
        });
      }),
  });

  return Layer.mergeAll(
    Layer.succeed(DashboardRepository, dashboardRepository),
    Layer.succeed(AlertRepository, alertRepository),
  );
};
