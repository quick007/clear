import { Alert, ManualAlert } from "@groundtruth/domain";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import { MutationErrors, ReadErrors, UnsupportedAlertAggregationError } from "../errors.ts";
import {
  AlertPath,
  CreateAlertRequest,
  CreateManualAlertRequest,
  ManualAlertList,
  StartInvestigationRequest,
} from "../model/alerts.ts";
import { IncidentDetail } from "../model/incidents.ts";
import { ProjectPath } from "../model/common.ts";
import { GroundtruthAccess } from "../middleware.ts";

export class AlertsApi extends HttpApiGroup.make("alerts")
  .add(
    HttpApiEndpoint.post("createAlert", "/:projectId/alerts", {
      params: ProjectPath,
      payload: CreateAlertRequest,
      success: Alert.pipe(HttpApiSchema.status(201)),
      error: [...MutationErrors, UnsupportedAlertAggregationError],
    }),
    HttpApiEndpoint.delete("deleteAlert", "/:projectId/alerts/:alertId", {
      params: { ...ProjectPath, ...AlertPath },
      success: HttpApiSchema.NoContent,
      error: MutationErrors,
    }),
    HttpApiEndpoint.get("listManualAlerts", "/:projectId/alerts/manual", {
      params: ProjectPath,
      success: ManualAlertList,
      error: ReadErrors,
    }),
    HttpApiEndpoint.post("createManualAlert", "/:projectId/alerts/manual", {
      params: ProjectPath,
      payload: CreateManualAlertRequest,
      success: ManualAlert.pipe(HttpApiSchema.status(201)),
      error: MutationErrors,
    }),
    HttpApiEndpoint.post("startInvestigation", "/:projectId/alerts/:alertId/investigation", {
      params: { ...ProjectPath, ...AlertPath },
      payload: StartInvestigationRequest,
      success: IncidentDetail.pipe(HttpApiSchema.status(201)),
      error: MutationErrors,
    }),
  )
  .middleware(GroundtruthAccess)
  .prefix("/v1/projects")
  .annotateMerge(
    OpenApi.annotations({
      title: "Alert rules",
      description: "Create and remove project alert rules",
    }),
  ) {}
