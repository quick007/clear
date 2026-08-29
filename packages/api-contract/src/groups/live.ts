import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import { ReadErrors, StreamFailure } from "../errors.ts";
import { ProjectPath } from "../model/common.ts";
import { LiveEvent, LiveEventQuery } from "../model/events.ts";
import { GroundtruthAccess } from "../middleware.ts";

export const LiveEventStream = HttpApiSchema.StreamSse({
  data: LiveEvent,
  error: StreamFailure,
});

export class LiveApi extends HttpApiGroup.make("live")
  .add(
    HttpApiEndpoint.get("stream", "/:projectId/events/stream", {
      params: ProjectPath,
      query: LiveEventQuery,
      success: LiveEventStream,
      error: ReadErrors,
    }),
  )
  .middleware(GroundtruthAccess)
  .prefix("/v1/projects")
  .annotateMerge(
    OpenApi.annotations({
      title: "Live events",
      description: "Typed project event stream with durable replay cursors",
    }),
  ) {}
