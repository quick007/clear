import { Alert, ServiceMetadata } from "@groundtruth/domain";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { ReadErrors } from "../errors.ts";
import { ProjectPath } from "../model/common.ts";
import { AlertListQuery, ConsoleOverview } from "../model/overview.ts";
import { GroundtruthAccess } from "../middleware.ts";

export class OverviewApi extends HttpApiGroup.make("overview")
  .add(
    HttpApiEndpoint.get("getOverview", "/:projectId/overview", {
      params: ProjectPath,
      success: ConsoleOverview,
      error: ReadErrors,
    }),
    HttpApiEndpoint.get("listServices", "/:projectId/services", {
      params: ProjectPath,
      success: Schema.Array(ServiceMetadata),
      error: ReadErrors,
    }),
    HttpApiEndpoint.get("listAlerts", "/:projectId/alerts", {
      params: ProjectPath,
      query: AlertListQuery,
      success: Schema.Array(Alert),
      error: ReadErrors,
    }),
  )
  .middleware(GroundtruthAccess)
  .prefix("/v1/projects")
  .annotateMerge(
    OpenApi.annotations({
      title: "Overview",
      description: "Project orientation, services, signal health, and alerts",
    }),
  ) {}
