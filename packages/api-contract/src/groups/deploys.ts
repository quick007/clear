import { DeployEvent } from "@groundtruth/domain";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import {
  IngestKeyRejectedError,
  QuotaExceededError,
  ReadErrors,
  ServiceUnavailable,
} from "../errors.ts";
import { ProjectPath } from "../model/common.ts";
import { DeployEventPage, DeployListQuery, RecordDeployEventRequest } from "../model/deploys.ts";
import { GroundtruthAccess, IngestKeyAccess } from "../middleware.ts";

const listDeployEvents = HttpApiEndpoint.get(
  "listDeployEvents",
  "/projects/:projectId/deploy-events",
  {
    params: ProjectPath,
    query: DeployListQuery,
    success: DeployEventPage,
    error: ReadErrors,
  },
).middleware(GroundtruthAccess);

const recordDeployEvent = HttpApiEndpoint.post("recordDeployEvent", "/events/deploy", {
  payload: RecordDeployEventRequest,
  success: DeployEvent.pipe(HttpApiSchema.status(201)),
  error: [IngestKeyRejectedError, QuotaExceededError, ServiceUnavailable],
}).middleware(IngestKeyAccess);

export class DeploysApi extends HttpApiGroup.make("deploys")
  .add(listDeployEvents, recordDeployEvent)
  .prefix("/v1")
  .annotateMerge(
    OpenApi.annotations({
      title: "Deploy events",
      description: "Deploy annotations and inbound deploy webhooks",
    }),
  ) {}
