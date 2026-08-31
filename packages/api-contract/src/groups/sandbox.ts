import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import { MutationErrors } from "../errors.ts";
import { SandboxState } from "../model/sandbox.ts";
import { GroundtruthAccess } from "../middleware.ts";

export class SandboxApi extends HttpApiGroup.make("sandbox")
  .add(
    HttpApiEndpoint.post("createSession", "/session", {
      success: SandboxState.pipe(HttpApiSchema.status(201)),
      error: MutationErrors,
    }),
    HttpApiEndpoint.post("triggerIncident", "/trigger", {
      success: SandboxState,
      error: MutationErrors,
    }).middleware(GroundtruthAccess),
    HttpApiEndpoint.post("simulateRecovery", "/recover", {
      success: SandboxState,
      error: MutationErrors,
    }).middleware(GroundtruthAccess),
    HttpApiEndpoint.post("reset", "/reset", {
      success: SandboxState,
      error: MutationErrors,
    }).middleware(GroundtruthAccess),
  )
  .prefix("/v1/sandbox")
  .annotateMerge(
    OpenApi.annotations({
      title: "Sandbox",
      description: "Deterministic incident controls for ephemeral sessions",
    }),
  ) {}
