import {
  AnnotatePanelRequest,
  BoardChanged,
  BoardState,
  CreatePanelRequest,
  LiveEventId,
  NoteAnnotation,
  PanelChanged,
  PanelView,
  ServiceUnavailable,
  UpdatePanelRequest,
} from "@groundtruth/api-contract";
import {
  type DashboardId,
  DashboardId as DashboardIdSchema,
  type DashboardMetadata,
  type DeployEvent,
  EntityNotFound,
  PanelId,
  type PanelId as PanelIdType,
  PanelMetadata,
  PanelTitle,
  type ProjectId,
  QuotaExceeded,
  ResourceConflict,
} from "@groundtruth/domain";
import { Context, Crypto, DateTime, Effect, Layer, Ref, Result } from "effect";
import { LiveEventBus } from "../live/LiveEventBus.js";
import { sandboxDashboardId, sandboxProjectId } from "../memory/SeedIds.js";
import { emptyDefaultBoard, sandboxBoard, sandboxBoardForProject } from "./BoardFixtures.js";
import {
  type BoardMemory,
  type BoardMutation,
  boardMissing,
  findPanelBoard,
  normalizePositions,
  type PanelMutation,
  panelMissing,
  withBoard,
  withPanels,
} from "./BoardState.js";
import { annotateDeployState } from "./BoardDeploy.js";

const panelLimit = 12;

export class BoardService extends Context.Service<
  BoardService,
  {
    getDefaultBoard(projectId: ProjectId): Effect.Effect<BoardState, ServiceUnavailable>;
    ensureSandboxBoard(projectId: ProjectId, replace?: boolean): Effect.Effect<BoardState>;
    listDashboards(
      projectId: ProjectId,
    ): Effect.Effect<ReadonlyArray<DashboardMetadata>, ServiceUnavailable>;
    getBoard(
      projectId: ProjectId,
      dashboardId: DashboardId,
    ): Effect.Effect<BoardState, EntityNotFound | ServiceUnavailable>;
    createPanel(
      projectId: ProjectId,
      request: CreatePanelRequest,
    ): Effect.Effect<PanelView, EntityNotFound | QuotaExceeded | ServiceUnavailable>;
    updatePanel(
      projectId: ProjectId,
      panelId: PanelIdType,
      request: UpdatePanelRequest,
    ): Effect.Effect<PanelView, EntityNotFound | ResourceConflict | ServiceUnavailable>;
    annotatePanel(
      projectId: ProjectId,
      panelId: PanelIdType,
      request: AnnotatePanelRequest,
    ): Effect.Effect<PanelView, EntityNotFound | ServiceUnavailable>;
    annotateDeploy(
      projectId: ProjectId,
      deploy: DeployEvent,
    ): Effect.Effect<void, ServiceUnavailable>;
    clearProject(projectId: ProjectId): Effect.Effect<void, ServiceUnavailable>;
    removePanel(
      projectId: ProjectId,
      panelId: PanelIdType,
    ): Effect.Effect<void, EntityNotFound | ServiceUnavailable>;
  }
>()("groundtruth/backend/board/BoardService") {
  static readonly layerMemory = Layer.effect(
    BoardService,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const events = yield* LiveEventBus;
      const startedAt = yield* DateTime.now;
      const initialBoard = sandboxBoard(startedAt);
      const state = yield* Ref.make<BoardMemory>({
        boardsByProject: new Map([
          [sandboxProjectId, new Map([[sandboxDashboardId, initialBoard]])],
        ]),
        defaultByProject: new Map([[sandboxProjectId, sandboxDashboardId]]),
      });

      const nextUuid = crypto.randomUUIDv7.pipe(Effect.orDie);
      const nextLiveEventId = nextUuid.pipe(Effect.map((uuid) => LiveEventId.make(uuid)));

      const publishMutation = Effect.fn("BoardService.publishMutation")(function* (
        projectId: ProjectId,
        mutation: BoardMutation,
        change: "created" | "updated" | "removed" | "annotated",
        occurredAt: DateTime.Utc,
        panelEventId: LiveEventId,
        boardEventId: LiveEventId,
      ) {
        yield* events.publishAll([
          new PanelChanged({
            eventId: panelEventId,
            projectId,
            occurredAt,
            dashboardId: mutation.board.dashboard.id,
            panelId: mutation.panelId,
            revision: mutation.panelRevision,
            change,
          }),
          new BoardChanged({
            eventId: boardEventId,
            projectId,
            occurredAt,
            dashboardId: mutation.board.dashboard.id,
            revision: mutation.board.revision,
          }),
        ]);
      });

      const getDefaultBoard = Effect.fn("BoardService.getDefaultBoard")(function* (
        projectId: ProjectId,
      ) {
        const dashboardId = DashboardIdSchema.make(yield* nextUuid);
        const now = yield* DateTime.now;
        return yield* Ref.modify(state, (memory) => {
          const existingId = memory.defaultByProject.get(projectId);
          const existing =
            existingId === undefined
              ? undefined
              : memory.boardsByProject.get(projectId)?.get(existingId);
          if (existing !== undefined) {
            return [existing, memory];
          }

          const board = emptyDefaultBoard(projectId, dashboardId, now);
          const defaultByProject = new Map(memory.defaultByProject);
          defaultByProject.set(projectId, dashboardId);
          return [board, { ...withBoard(memory, projectId, board), defaultByProject }];
        });
      });

      const ensureSandboxBoard = Effect.fn("BoardService.ensureSandboxBoard")(function* (
        projectId: ProjectId,
        replace = false,
      ) {
        const dashboardId = DashboardIdSchema.make(yield* nextUuid);
        const panelId = PanelId.make(yield* nextUuid);
        const now = yield* DateTime.now;
        return yield* Ref.modify(state, (memory) => {
          const currentId = memory.defaultByProject.get(projectId);
          const current =
            currentId === undefined
              ? undefined
              : memory.boardsByProject.get(projectId)?.get(currentId);
          if (current !== undefined && !replace) {
            return [current, memory];
          }
          const board = sandboxBoardForProject(projectId, dashboardId, panelId, now);
          const defaultByProject = new Map(memory.defaultByProject);
          defaultByProject.set(projectId, dashboardId);
          return [board, { ...withBoard(memory, projectId, board), defaultByProject }];
        });
      });

      const listDashboards = Effect.fn("BoardService.listDashboards")(function* (
        projectId: ProjectId,
      ) {
        yield* getDefaultBoard(projectId);
        return Array.from((yield* Ref.get(state)).boardsByProject.get(projectId)?.values() ?? [])
          .map((board) => board.dashboard)
          .sort((left, right) => String(left.id).localeCompare(String(right.id)));
      });

      const getBoard = Effect.fn("BoardService.getBoard")(function* (
        projectId: ProjectId,
        dashboardId: DashboardId,
      ) {
        const board = (yield* Ref.get(state)).boardsByProject.get(projectId)?.get(dashboardId);
        if (board === undefined) {
          return yield* boardMissing(dashboardId);
        }
        return board;
      });

      const createPanel = Effect.fn("BoardService.createPanel")(function* (
        projectId: ProjectId,
        request: CreatePanelRequest,
      ) {
        const panelId = PanelId.make(yield* nextUuid);
        const panelEventId = yield* nextLiveEventId;
        const boardEventId = yield* nextLiveEventId;
        const now = yield* DateTime.now;
        const outcome = yield* Ref.modify<
          BoardMemory,
          Result.Result<PanelMutation, EntityNotFound | QuotaExceeded>
        >(state, (memory) => {
          const board = memory.boardsByProject.get(projectId)?.get(request.dashboardId);
          if (board === undefined) {
            return [Result.fail(boardMissing(request.dashboardId)), memory];
          }
          if (board.panels.length >= panelLimit) {
            return [
              Result.fail(
                new QuotaExceeded({
                  quota: "panels-per-dashboard",
                  limit: panelLimit,
                  observed: board.panels.length + 1,
                  message: `A dashboard can contain at most ${panelLimit} panels`,
                }),
              ),
              memory,
            ];
          }

          const position = Math.min(request.position ?? board.panels.length, board.panels.length);
          const panel = new PanelView({
            metadata: new PanelMetadata({
              id: panelId,
              projectId,
              dashboardId: board.dashboard.id,
              title: PanelTitle.make(String(request.spec.title)),
              position,
              revision: 1,
              createdAt: now,
              updatedAt: now,
            }),
            spec: request.spec,
            annotations: [],
          });
          const inserted = [...board.panels];
          inserted.splice(position, 0, panel);
          const nextBoard = withPanels(board, normalizePositions(inserted, now), now);
          return [
            Result.succeed({ board: nextBoard, panel }),
            withBoard(memory, projectId, nextBoard),
          ];
        });
        if (Result.isFailure(outcome)) {
          return yield* outcome.failure;
        }
        yield* publishMutation(
          projectId,
          {
            board: outcome.success.board,
            panelId,
            panelRevision: outcome.success.panel.metadata.revision,
          },
          "created",
          now,
          panelEventId,
          boardEventId,
        );
        return outcome.success.panel;
      });

      const updatePanel = Effect.fn("BoardService.updatePanel")(function* (
        projectId: ProjectId,
        panelId: PanelIdType,
        request: UpdatePanelRequest,
      ) {
        const panelEventId = yield* nextLiveEventId;
        const boardEventId = yield* nextLiveEventId;
        const now = yield* DateTime.now;
        const outcome = yield* Ref.modify<
          BoardMemory,
          Result.Result<PanelMutation, EntityNotFound | ResourceConflict>
        >(state, (memory) => {
          const found = findPanelBoard(memory.boardsByProject.get(projectId), panelId);
          if (found === undefined) {
            return [Result.fail(panelMissing(panelId)), memory];
          }
          if (found.panel.metadata.revision !== request.expectedRevision) {
            return [
              Result.fail(
                new ResourceConflict({
                  resource: "panel",
                  message: `Panel revision is ${found.panel.metadata.revision}, not ${request.expectedRevision}`,
                }),
              ),
              memory,
            ];
          }

          const remaining = found.board.panels.filter((panel) => panel.metadata.id !== panelId);
          const position = Math.min(
            request.position ?? found.panel.metadata.position,
            remaining.length,
          );
          const updated = new PanelView({
            metadata: new PanelMetadata({
              id: found.panel.metadata.id,
              projectId: found.panel.metadata.projectId,
              dashboardId: found.panel.metadata.dashboardId,
              title: PanelTitle.make(String(request.spec.title)),
              position,
              revision: found.panel.metadata.revision + 1,
              createdAt: found.panel.metadata.createdAt,
              updatedAt: now,
            }),
            spec: request.spec,
            annotations: found.panel.annotations,
          });
          const reordered = [...remaining];
          reordered.splice(position, 0, updated);
          const nextBoard = withPanels(found.board, normalizePositions(reordered, now), now);
          return [
            Result.succeed({ board: nextBoard, panel: updated }),
            withBoard(memory, projectId, nextBoard),
          ];
        });
        if (Result.isFailure(outcome)) {
          return yield* outcome.failure;
        }
        yield* publishMutation(
          projectId,
          {
            board: outcome.success.board,
            panelId,
            panelRevision: outcome.success.panel.metadata.revision,
          },
          "updated",
          now,
          panelEventId,
          boardEventId,
        );
        return outcome.success.panel;
      });

      const annotatePanel = Effect.fn("BoardService.annotatePanel")(function* (
        projectId: ProjectId,
        panelId: PanelIdType,
        request: AnnotatePanelRequest,
      ) {
        const panelEventId = yield* nextLiveEventId;
        const boardEventId = yield* nextLiveEventId;
        const now = yield* DateTime.now;
        const outcome = yield* Ref.modify<
          BoardMemory,
          Result.Result<PanelMutation, EntityNotFound>
        >(state, (memory) => {
          const found = findPanelBoard(memory.boardsByProject.get(projectId), panelId);
          if (found === undefined) {
            return [Result.fail(panelMissing(panelId)), memory];
          }
          const annotated = new PanelView({
            metadata: new PanelMetadata({
              id: found.panel.metadata.id,
              projectId: found.panel.metadata.projectId,
              dashboardId: found.panel.metadata.dashboardId,
              title: found.panel.metadata.title,
              position: found.panel.metadata.position,
              revision: found.panel.metadata.revision + 1,
              createdAt: found.panel.metadata.createdAt,
              updatedAt: now,
            }),
            spec: found.panel.spec,
            annotations: [
              ...found.panel.annotations,
              new NoteAnnotation({ at: request.at, label: request.label }),
            ],
          });
          const panels = found.board.panels.map((panel) =>
            panel.metadata.id === panelId ? annotated : panel,
          );
          const nextBoard = withPanels(found.board, panels, now);
          return [
            Result.succeed({ board: nextBoard, panel: annotated }),
            withBoard(memory, projectId, nextBoard),
          ];
        });
        if (Result.isFailure(outcome)) {
          return yield* outcome.failure;
        }
        yield* publishMutation(
          projectId,
          {
            board: outcome.success.board,
            panelId,
            panelRevision: outcome.success.panel.metadata.revision,
          },
          "annotated",
          now,
          panelEventId,
          boardEventId,
        );
        return outcome.success.panel;
      });

      const removePanel = Effect.fn("BoardService.removePanel")(function* (
        projectId: ProjectId,
        panelId: PanelIdType,
      ) {
        const panelEventId = yield* nextLiveEventId;
        const boardEventId = yield* nextLiveEventId;
        const now = yield* DateTime.now;
        const outcome = yield* Ref.modify<
          BoardMemory,
          Result.Result<BoardMutation, EntityNotFound>
        >(state, (memory) => {
          const found = findPanelBoard(memory.boardsByProject.get(projectId), panelId);
          if (found === undefined) {
            return [Result.fail(panelMissing(panelId)), memory];
          }
          const remaining = found.board.panels.filter((panel) => panel.metadata.id !== panelId);
          const nextBoard = withPanels(found.board, normalizePositions(remaining, now), now);
          return [
            Result.succeed({
              board: nextBoard,
              panelId,
              panelRevision: found.panel.metadata.revision,
            }),
            withBoard(memory, projectId, nextBoard),
          ];
        });
        if (Result.isFailure(outcome)) {
          return yield* outcome.failure;
        }
        yield* publishMutation(
          projectId,
          outcome.success,
          "removed",
          now,
          panelEventId,
          boardEventId,
        );
      });

      const annotateDeploy = Effect.fn("BoardService.annotateDeploy")(function* (
        projectId: ProjectId,
        deploy: DeployEvent,
      ) {
        const occurredAt = deploy.receivedAt;
        const mutations = yield* Ref.modify<BoardMemory, ReadonlyArray<BoardMutation>>(
          state,
          (memory) => {
            const result = annotateDeployState(memory, projectId, deploy);
            return [result.mutations, result.memory];
          },
        );
        yield* Effect.forEach(
          mutations,
          (mutation) =>
            Effect.gen(function* () {
              yield* publishMutation(
                projectId,
                mutation,
                "annotated",
                occurredAt,
                yield* nextLiveEventId,
                yield* nextLiveEventId,
              );
            }),
          { discard: true },
        );
      });

      const clearProject = Effect.fn("BoardService.clearProject")((projectId: ProjectId) =>
        Ref.update(state, (memory) => {
          const boardsByProject = new Map(memory.boardsByProject);
          const defaultByProject = new Map(memory.defaultByProject);
          boardsByProject.delete(projectId);
          defaultByProject.delete(projectId);
          return { boardsByProject, defaultByProject };
        }),
      );

      return BoardService.of({
        getDefaultBoard,
        ensureSandboxBoard,
        listDashboards,
        getBoard,
        createPanel,
        updatePanel,
        annotatePanel,
        annotateDeploy,
        clearProject,
        removePanel,
      });
    }),
  );
}
