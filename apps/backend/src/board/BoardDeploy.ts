import { DeployAnnotation, PanelView, type BoardState } from "@groundtruth/api-contract";
import { type DeployEvent, PanelMetadata, type ProjectId } from "@groundtruth/domain";
import type { DateTime } from "effect";
import {
  type BoardMemory,
  type BoardMutation,
  panelTargetsService,
  withBoard,
  withPanels,
} from "./BoardState.js";

const annotatePanel = (
  panel: PanelView,
  deploy: DeployEvent,
  label: string,
  occurredAt: DateTime.Utc,
) =>
  new PanelView({
    metadata: new PanelMetadata({
      id: panel.metadata.id,
      projectId: panel.metadata.projectId,
      dashboardId: panel.metadata.dashboardId,
      title: panel.metadata.title,
      position: panel.metadata.position,
      revision: panel.metadata.revision + 1,
      createdAt: panel.metadata.createdAt,
      updatedAt: occurredAt,
    }),
    spec: panel.spec,
    annotations: [
      ...panel.annotations,
      new DeployAnnotation({
        at: deploy.deployedAt,
        label,
        deployEventId: deploy.id,
      }),
    ],
  });

const annotateBoard = (
  board: BoardState,
  deploy: DeployEvent,
  label: string,
  occurredAt: DateTime.Utc,
) => {
  const mutations: Array<BoardMutation> = [];
  const panels = board.panels.map((panel) => {
    if (!panelTargetsService(panel, String(deploy.serviceName))) {
      return panel;
    }
    const annotated = annotatePanel(panel, deploy, label, occurredAt);
    mutations.push({
      board,
      panelId: annotated.metadata.id,
      panelRevision: annotated.metadata.revision,
    });
    return annotated;
  });
  if (mutations.length === 0) {
    return null;
  }
  const nextBoard = withPanels(board, panels, occurredAt);
  return {
    board: nextBoard,
    mutations: mutations.map(({ panelId, panelRevision }) => ({
      board: nextBoard,
      panelId,
      panelRevision,
    })),
  };
};

export const annotateDeployState = (
  memory: BoardMemory,
  projectId: ProjectId,
  deploy: DeployEvent,
) => {
  const projectBoards = memory.boardsByProject.get(projectId);
  if (projectBoards === undefined) {
    return { memory, mutations: [] as ReadonlyArray<BoardMutation> };
  }

  const label = `${deploy.serviceName} deploy ${String(deploy.sha).slice(0, 7)}`;
  let next = memory;
  const mutations: Array<BoardMutation> = [];
  for (const board of projectBoards.values()) {
    const result = annotateBoard(board, deploy, label, deploy.receivedAt);
    if (result !== null) {
      next = withBoard(next, projectId, result.board);
      mutations.push(...result.mutations);
    }
  }
  return { memory: next, mutations };
};
