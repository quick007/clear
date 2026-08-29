import { DashboardId } from "@groundtruth/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import { MutationErrors, ReadErrors } from "../errors.ts";
import {
  AnnotatePanelRequest,
  BoardState,
  CreatePanelRequest,
  PanelPath,
  PanelView,
  UpdatePanelRequest,
} from "../model/board.ts";
import { ProjectPath } from "../model/common.ts";
import { GroundtruthAccess } from "../middleware.ts";

export const BoardQuery = {
  dashboardId: Schema.optional(DashboardId),
} as const;

export class BoardApi extends HttpApiGroup.make("board")
  .add(
    HttpApiEndpoint.get("getBoard", "/:projectId/board", {
      params: ProjectPath,
      query: BoardQuery,
      success: BoardState,
      error: ReadErrors,
    }),
    HttpApiEndpoint.post("createPanel", "/:projectId/panels", {
      params: ProjectPath,
      payload: CreatePanelRequest,
      success: PanelView.pipe(HttpApiSchema.status(201)),
      error: MutationErrors,
    }),
    HttpApiEndpoint.patch("updatePanel", "/:projectId/panels/:panelId", {
      params: { ...ProjectPath, ...PanelPath },
      payload: UpdatePanelRequest,
      success: PanelView,
      error: MutationErrors,
    }),
    HttpApiEndpoint.delete("removePanel", "/:projectId/panels/:panelId", {
      params: { ...ProjectPath, ...PanelPath },
      success: HttpApiSchema.NoContent,
      error: MutationErrors,
    }),
    HttpApiEndpoint.post("annotatePanel", "/:projectId/panels/:panelId/annotations", {
      params: { ...ProjectPath, ...PanelPath },
      payload: AnnotatePanelRequest,
      success: PanelView,
      error: MutationErrors,
    }),
  )
  .middleware(GroundtruthAccess)
  .prefix("/v1/projects")
  .annotateMerge(
    OpenApi.annotations({
      title: "Board",
      description: "Shared dashboard state and panel composition",
    }),
  ) {}
