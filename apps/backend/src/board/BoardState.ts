import { BoardState, PanelView } from "@groundtruth/api-contract";
import {
  type DashboardId,
  DashboardMetadata,
  EntityNotFound,
  type PanelId,
  PanelMetadata,
  type ProjectId,
} from "@groundtruth/domain";
import type { DateTime } from "effect";

export type ProjectBoards = ReadonlyMap<DashboardId, BoardState>;

export interface BoardMemory {
  readonly boardsByProject: ReadonlyMap<ProjectId, ProjectBoards>;
  readonly defaultByProject: ReadonlyMap<ProjectId, DashboardId>;
}

export interface PanelMutation {
  readonly board: BoardState;
  readonly panel: PanelView;
}

export interface BoardMutation {
  readonly board: BoardState;
  readonly panelId: PanelId;
  readonly panelRevision: number;
}

export const boardMissing = (dashboardId: DashboardId) =>
  new EntityNotFound({
    entity: "dashboard",
    id: dashboardId,
    message: "Dashboard not found",
  });

export const panelMissing = (panelId: PanelId) =>
  new EntityNotFound({
    entity: "panel",
    id: panelId,
    message: "Panel not found",
  });

export const withBoard = (
  memory: BoardMemory,
  projectId: ProjectId,
  board: BoardState,
): BoardMemory => {
  const projectBoards = new Map(memory.boardsByProject.get(projectId) ?? []);
  projectBoards.set(board.dashboard.id, board);
  const boardsByProject = new Map(memory.boardsByProject);
  boardsByProject.set(projectId, projectBoards);
  return { ...memory, boardsByProject };
};

export const findPanelBoard = (boards: ProjectBoards | undefined, panelId: PanelId) => {
  if (boards === undefined) {
    return undefined;
  }
  for (const board of boards.values()) {
    const panel = board.panels.find((candidate) => candidate.metadata.id === panelId);
    if (panel !== undefined) {
      return { board, panel };
    }
  }
  return undefined;
};

export const panelTargetsService = (panel: PanelView, serviceName: string) => {
  const queries = panel.spec._tag === "stat" ? [panel.spec.query] : panel.spec.queries;
  const filters = queries
    .flatMap((query) => query.filters ?? [])
    .filter((filter) => String(filter.attribute) === "service.name");
  if (filters.length === 0) {
    return true;
  }
  return filters.some((filter) => {
    switch (filter._tag) {
      case "match":
        return filter.operator === "eq"
          ? filter.value === serviceName
          : filter.value !== serviceName;
      case "set":
        return filter.operator === "in"
          ? filter.values.includes(serviceName)
          : !filter.values.includes(serviceName);
      default:
        return true;
    }
  });
};

const panelAtPosition = (panel: PanelView, position: number, now: DateTime.Utc) =>
  panel.metadata.position === position
    ? panel
    : new PanelView({
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
        spec: panel.spec,
        annotations: panel.annotations,
      });

export const normalizePositions = (panels: ReadonlyArray<PanelView>, now: DateTime.Utc) =>
  panels.map((panel, position) => panelAtPosition(panel, position, now));

export const withPanels = (
  board: BoardState,
  panels: ReadonlyArray<PanelView>,
  now: DateTime.Utc,
) =>
  new BoardState({
    dashboard: new DashboardMetadata({
      id: board.dashboard.id,
      projectId: board.dashboard.projectId,
      name: board.dashboard.name,
      description: board.dashboard.description,
      createdAt: board.dashboard.createdAt,
      updatedAt: now,
    }),
    panels,
    revision: board.revision + 1,
    updatedAt: now,
  });
