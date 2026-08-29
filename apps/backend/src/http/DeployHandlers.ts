import { AuthorizedIngestProject, GroundtruthApi } from "@groundtruth/api-contract";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { DeployService } from "../deploys/DeployService.js";
import { IdentityService } from "../identity/IdentityService.js";
import { authorizeCurrentProject } from "./ApiMiddleware.js";

export const DeployHandlers = HttpApiBuilder.group(
  GroundtruthApi,
  "deploys",
  Effect.fn(function* (handlers) {
    const deploys = yield* DeployService;
    const identity = yield* IdentityService;

    return handlers
      .handle(
        "listDeployEvents",
        Effect.fn(function* ({ params, query }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* deploys.list(params.projectId, query);
        }),
      )
      .handle(
        "recordDeployEvent",
        Effect.fn(function* ({ payload }) {
          const projectId = yield* AuthorizedIngestProject;
          return yield* deploys.record(projectId, payload);
        }),
      );
  }),
);
