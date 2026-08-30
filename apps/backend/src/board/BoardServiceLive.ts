import {
  BoardChanged,
  BoardState,
  DeployAnnotation,
  LiveEventId,
  NoteAnnotation,
  PanelChanged,
  PanelView,
  ServiceUnavailable,
} from "@groundtruth/api-contract";
import {
  DashboardName,
  EntityNotFound,
  NonEmptyText,
  PanelTitle,
  QuotaExceeded,
  ResourceConflict,
  type DashboardId,
  type DeployEvent,
  type PanelId,
  type ProjectId,
} from "@groundtruth/domain";
import {
  DashboardRepository,
  type DashboardRecord,
  PanelDeployAnnotation,
  PanelNoteAnnotation,
  type PanelRecord,
  type PersistenceError,
} from "@groundtruth/persistence";
import { Context, Crypto, DateTime, Effect, Layer, Option } from "effect";
import { LiveEventBus } from "../live/LiveEventBus.js";
import { isSandboxProjectId } from "../memory/SeedIds.js";
import { BoardService } from "./BoardService.js";
import { panelTargetsService } from "./BoardState.js";

const panelLimit = 12;

const unavailable = (error: PersistenceError) =>
  new ServiceUnavailable({
    service: error.store,
    message: `Storage operation failed (reference ${error.correlationId})`,
  });

const missing = (entity: "dashboard" | "panel", id: DashboardId | PanelId) =>
  new EntityNotFound({
    entity,
    id,
    message: `${entity === "panel" ? "Panel" : "Dashboard"} not found`,
  });

const toPanelView = (record: PanelRecord) =>
  new PanelView({
    metadata: record.metadata,
    spec: record.spec,
    annotations: record.annotations.map((annotation) =>
      annotation._tag === "note"
        ? new NoteAnnotation({ at: annotation.at, label: annotation.label })
        : new DeployAnnotation({
            at: annotation.at,
            label: annotation.label,
            deployEventId: annotation.deployEventId,
          }),
    ),
  });

const boardRevision = (record: DashboardRecord) =>
  record.panels.reduce((revision, panel) => revision + panel.metadata.revision, 0);

const toBoardState = (record: DashboardRecord) => {
  const panels = record.panels.map(toPanelView);
  const updatedAt = panels.reduce(
    (latest, panel) =>
      DateTime.toEpochMillis(panel.metadata.updatedAt) > DateTime.toEpochMillis(latest)
        ? panel.metadata.updatedAt
        : latest,
    record.metadata.updatedAt,
  );
  return new BoardState({
    dashboard: record.metadata,
    panels,
    revision: boardRevision(record),
    updatedAt,
  });
};

const findPanel = (dashboards: ReadonlyArray<DashboardRecord>, panelId: PanelId) => {
  for (const dashboard of dashboards) {
    const panel = dashboard.panels.find((candidate) => candidate.metadata.id === panelId);
    if (panel !== undefined) return { dashboard, panel };
  }
  return undefined;
};

export const BoardServiceLive = Layer.effect(
  BoardService,
  Effect.gen(function* () {
    const repository = yield* DashboardRepository;
    const events = yield* LiveEventBus;
    const crypto = yield* Crypto.Crypto;
    const memoryContext = yield* Layer.build(BoardService.layerMemory);
    const memory = Context.get(memoryContext, BoardService);

    const fromRepository = <Value>(effect: Effect.Effect<Value, PersistenceError>) =>
      effect.pipe(
        Effect.tapError((error) => Effect.logError("Board storage operation failed", { error })),
        Effect.mapError(unavailable),
      );

    const listRecords = (projectId: ProjectId) => fromRepository(repository.list(projectId));

    const getRecord = Effect.fn("BoardServiceLive.getRecord")(function* (
      projectId: ProjectId,
      dashboardId: DashboardId,
    ) {
      const record = yield* fromRepository(repository.findById(projectId, dashboardId));
      if (Option.isNone(record)) return yield* missing("dashboard", dashboardId);
      return record.value;
    });

    const publish = Effect.fn("BoardServiceLive.publish")(function* (
      projectId: ProjectId,
      panel: PanelRecord,
      change: "created" | "updated" | "removed" | "annotated",
    ) {
      const board = yield* getRecord(projectId, panel.metadata.dashboardId).pipe(
        Effect.catchTag(
          "EntityNotFound",
          () =>
            new ServiceUnavailable({
              service: "storage",
              message: "Board changed but its dashboard could not be reloaded",
            }),
        ),
      );
      const occurredAt = yield* DateTime.now;
      const [panelEventId, boardEventId] = yield* Effect.all([
        crypto.randomUUIDv7,
        crypto.randomUUIDv7,
      ]).pipe(Effect.orDie);
      yield* events.publishAll([
        new PanelChanged({
          eventId: LiveEventId.make(panelEventId),
          projectId,
          occurredAt,
          dashboardId: panel.metadata.dashboardId,
          panelId: panel.metadata.id,
          revision: panel.metadata.revision,
          change,
        }),
        new BoardChanged({
          eventId: LiveEventId.make(boardEventId),
          projectId,
          occurredAt,
          dashboardId: panel.metadata.dashboardId,
          revision: boardRevision(board),
        }),
      ]);
    });

    const getDefaultBoard = Effect.fn("BoardServiceLive.getDefaultBoard")(function* (
      projectId: ProjectId,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.getDefaultBoard(projectId);
      const records = yield* listRecords(projectId);
      const current = records.find((record) => record.isDefault) ?? records[0];
      const record =
        current ??
        (yield* fromRepository(
          repository.create(projectId, {
            name: DashboardName.make("Operations"),
            description: null,
            isDefault: true,
          }),
        ));
      return toBoardState(record);
    });

    const listDashboards = Effect.fn("BoardServiceLive.listDashboards")(function* (
      projectId: ProjectId,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.listDashboards(projectId);
      return (yield* listRecords(projectId)).map((record) => record.metadata);
    });

    const getBoard = Effect.fn("BoardServiceLive.getBoard")(function* (
      projectId: ProjectId,
      dashboardId: DashboardId,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.getBoard(projectId, dashboardId);
      return toBoardState(yield* getRecord(projectId, dashboardId));
    });

    const createPanel = Effect.fn("BoardServiceLive.createPanel")(function* (
      projectId: ProjectId,
      request: Parameters<BoardService["Service"]["createPanel"]>[1],
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.createPanel(projectId, request);
      const dashboard = yield* getRecord(projectId, request.dashboardId);
      if (dashboard.panels.length >= panelLimit) {
        return yield* new QuotaExceeded({
          quota: "panels-per-dashboard",
          limit: panelLimit,
          observed: dashboard.panels.length + 1,
          message: `A dashboard can contain at most ${panelLimit} panels`,
        });
      }
      const panel = yield* fromRepository(
        repository.addPanel(projectId, {
          dashboardId: request.dashboardId,
          title: PanelTitle.make(String(request.spec.title)),
          spec: request.spec,
          position: Math.min(request.position ?? dashboard.panels.length, dashboard.panels.length),
        }),
      );
      yield* publish(projectId, panel, "created");
      return toPanelView(panel);
    });

    const updatePanel = Effect.fn("BoardServiceLive.updatePanel")(function* (
      projectId: ProjectId,
      panelId: PanelId,
      request: Parameters<BoardService["Service"]["updatePanel"]>[2],
    ) {
      if (isSandboxProjectId(projectId))
        return yield* memory.updatePanel(projectId, panelId, request);
      const found = findPanel(yield* listRecords(projectId), panelId);
      if (found === undefined) return yield* missing("panel", panelId);
      if (found.panel.metadata.revision !== request.expectedRevision) {
        return yield* new ResourceConflict({
          resource: "panel",
          message: `Panel revision is ${found.panel.metadata.revision}, not ${request.expectedRevision}`,
        });
      }
      const updated = yield* fromRepository(
        repository.updatePanel(projectId, panelId, {
          title: PanelTitle.make(String(request.spec.title)),
          spec: request.spec,
          position: Math.min(
            request.position ?? found.panel.metadata.position,
            found.dashboard.panels.length - 1,
          ),
          expectedRevision: request.expectedRevision,
        }),
      );
      if (Option.isNone(updated)) {
        return yield* new ResourceConflict({
          resource: "panel",
          message: "Panel changed concurrently",
        });
      }
      yield* publish(projectId, updated.value, "updated");
      return toPanelView(updated.value);
    });

    const annotatePanel = Effect.fn("BoardServiceLive.annotatePanel")(function* (
      projectId: ProjectId,
      panelId: PanelId,
      request: Parameters<BoardService["Service"]["annotatePanel"]>[2],
    ) {
      if (isSandboxProjectId(projectId))
        return yield* memory.annotatePanel(projectId, panelId, request);
      const annotated = yield* fromRepository(
        repository.annotatePanel(
          projectId,
          panelId,
          new PanelNoteAnnotation({ at: request.at, label: NonEmptyText.make(request.label) }),
        ),
      );
      if (Option.isNone(annotated)) return yield* missing("panel", panelId);
      yield* publish(projectId, annotated.value, "annotated");
      return toPanelView(annotated.value);
    });

    const removePanel = Effect.fn("BoardServiceLive.removePanel")(function* (
      projectId: ProjectId,
      panelId: PanelId,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.removePanel(projectId, panelId);
      const found = findPanel(yield* listRecords(projectId), panelId);
      if (found === undefined) return yield* missing("panel", panelId);
      if (!(yield* fromRepository(repository.removePanel(projectId, panelId)))) {
        return yield* missing("panel", panelId);
      }
      yield* publish(projectId, found.panel, "removed");
    });

    const annotateDeploy = Effect.fn("BoardServiceLive.annotateDeploy")(function* (
      projectId: ProjectId,
      deploy: DeployEvent,
    ) {
      if (isSandboxProjectId(projectId)) return yield* memory.annotateDeploy(projectId, deploy);
      const dashboards = yield* listRecords(projectId);
      yield* Effect.forEach(
        dashboards
          .flatMap((dashboard) => dashboard.panels)
          .filter((panel) => panelTargetsService(toPanelView(panel), String(deploy.serviceName))),
        (panel) =>
          fromRepository(
            repository.annotatePanel(
              projectId,
              panel.metadata.id,
              new PanelDeployAnnotation({
                at: deploy.deployedAt,
                label: NonEmptyText.make(
                  `${deploy.serviceName} deploy ${String(deploy.sha).slice(0, 7)}`,
                ),
                deployEventId: deploy.id,
              }),
            ),
          ).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.void,
                onSome: (updated) => publish(projectId, updated, "annotated"),
              }),
            ),
          ),
        { discard: true },
      );
    });

    return BoardService.of({
      getDefaultBoard,
      ensureSandboxBoard: (projectId, replace) => memory.ensureSandboxBoard(projectId, replace),
      listDashboards,
      getBoard,
      createPanel,
      updatePanel,
      annotatePanel,
      annotateDeploy,
      clearProject: (projectId) =>
        isSandboxProjectId(projectId) ? memory.clearProject(projectId) : Effect.void,
      removePanel,
    });
  }),
);
