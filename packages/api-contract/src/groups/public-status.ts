import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { ServiceUnavailable } from "../errors.ts";
import { PublicStatusResponse } from "../model/public-status.ts";

export class PublicStatusApi extends HttpApiGroup.make("publicStatus")
  .add(
    HttpApiEndpoint.get("getStatus", "/status", {
      success: PublicStatusResponse,
      error: ServiceUnavailable,
    }),
  )
  .prefix("/v1/public")
  .annotateMerge(
    OpenApi.annotations({
      title: "Public status",
      description: "A bounded, read-only view of Clear service health and recent telemetry",
    }),
  ) {}
