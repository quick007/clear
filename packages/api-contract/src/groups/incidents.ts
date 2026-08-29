import { Hypothesis, TimelineEntry } from "@groundtruth/domain";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import { MutationErrors, ReadErrors } from "../errors.ts";
import { ProjectPath } from "../model/common.ts";
import {
  AddTimelineNoteRequest,
  CloseIncidentRequest,
  IncidentDetail,
  IncidentList,
  IncidentPath,
  OpenIncidentRequest,
  SetHypothesisRequest,
} from "../model/incidents.ts";
import { GroundtruthAccess } from "../middleware.ts";

export class IncidentsApi extends HttpApiGroup.make("incidents")
  .add(
    HttpApiEndpoint.get("getIncident", "/:projectId/incidents/:incidentId", {
      params: { ...ProjectPath, ...IncidentPath },
      success: IncidentDetail,
      error: ReadErrors,
    }),
    HttpApiEndpoint.get("listIncidents", "/:projectId/incidents", {
      params: ProjectPath,
      success: IncidentList,
      error: ReadErrors,
    }),
    HttpApiEndpoint.post("openIncident", "/:projectId/incidents", {
      params: ProjectPath,
      payload: OpenIncidentRequest,
      success: IncidentDetail.pipe(HttpApiSchema.status(201)),
      error: MutationErrors,
    }),
    HttpApiEndpoint.put("setHypothesis", "/:projectId/incidents/:incidentId/hypothesis", {
      params: { ...ProjectPath, ...IncidentPath },
      payload: SetHypothesisRequest,
      success: Hypothesis,
      error: MutationErrors,
    }),
    HttpApiEndpoint.post("addTimelineNote", "/:projectId/incidents/:incidentId/timeline", {
      params: { ...ProjectPath, ...IncidentPath },
      payload: AddTimelineNoteRequest,
      success: TimelineEntry.pipe(HttpApiSchema.status(201)),
      error: MutationErrors,
    }),
    HttpApiEndpoint.post("closeIncident", "/:projectId/incidents/:incidentId/close", {
      params: { ...ProjectPath, ...IncidentPath },
      payload: CloseIncidentRequest,
      success: IncidentDetail,
      error: MutationErrors,
    }),
  )
  .middleware(GroundtruthAccess)
  .prefix("/v1/projects")
  .annotateMerge(
    OpenApi.annotations({
      title: "Incidents",
      description: "Incident lifecycle, hypotheses, and timeline notes",
    }),
  ) {}
