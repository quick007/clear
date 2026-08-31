import { BoardState, PanelView } from "@groundtruth/api-contract";
import {
  type DashboardId,
  DashboardMetadata,
  DashboardName,
  NonEmptyText,
  PanelMetadata,
  type PanelId,
  PanelTitle,
  type ProjectId,
} from "@groundtruth/domain";
import {
  CheckoutLatencyPanel,
  PaymentRequestRatePanel,
  type PanelSpec,
} from "@groundtruth/panel-dsl";
import { type DateTime } from "effect";
import {
  latencyPanelId,
  requestsPanelId,
  sandboxDashboardId,
  sandboxProjectId,
} from "../memory/SeedIds.js";

const seededPanel = (
  projectId: ProjectId,
  dashboardId: DashboardId,
  panelId: PanelId,
  position: number,
  spec: PanelSpec,
  now: DateTime.Utc,
) =>
  new PanelView({
    metadata: new PanelMetadata({
      id: panelId,
      projectId,
      dashboardId,
      title: PanelTitle.make(String(spec.title)),
      position,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    }),
    spec,
    annotations: [],
  });

export const sandboxBoardForProject = (
  projectId: ProjectId,
  dashboardId: DashboardId,
  panelIds: readonly [PanelId, PanelId],
  now: DateTime.Utc,
) =>
  new BoardState({
    dashboard: new DashboardMetadata({
      id: dashboardId,
      projectId,
      name: DashboardName.make("Checkout operations"),
      description: NonEmptyText.make("Live reliability signals for the checkout path"),
      createdAt: now,
      updatedAt: now,
    }),
    panels: [
      seededPanel(projectId, dashboardId, panelIds[0], 0, PaymentRequestRatePanel, now),
      seededPanel(projectId, dashboardId, panelIds[1], 1, CheckoutLatencyPanel, now),
    ],
    revision: 1,
    updatedAt: now,
  });

export const sandboxBoard = (now: DateTime.Utc) =>
  sandboxBoardForProject(
    sandboxProjectId,
    sandboxDashboardId,
    [requestsPanelId, latencyPanelId],
    now,
  );

export const emptyDefaultBoard = (
  projectId: ProjectId,
  dashboardId: DashboardId,
  now: DateTime.Utc,
) =>
  new BoardState({
    dashboard: new DashboardMetadata({
      id: dashboardId,
      projectId,
      name: DashboardName.make("Overview"),
      description: null,
      createdAt: now,
      updatedAt: now,
    }),
    panels: [],
    revision: 0,
    updatedAt: now,
  });
