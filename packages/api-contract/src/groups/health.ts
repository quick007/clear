import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import { HealthResponse } from "../model/health.ts";

export class HealthApi extends HttpApiGroup.make("health")
  .add(
    HttpApiEndpoint.get("check", "/health", {
      success: HealthResponse,
      error: HealthResponse.pipe(HttpApiSchema.status(503)),
    }),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "Health",
      description: "Process and storage readiness",
    }),
  ) {}
