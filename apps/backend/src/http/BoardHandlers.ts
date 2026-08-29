import { GroundtruthApi } from "@groundtruth/api-contract";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { BoardService } from "../board/BoardService.js";
import { IdentityService } from "../identity/IdentityService.js";
import { authorizeCurrentProject } from "./ApiMiddleware.js";

export const BoardHandlers = HttpApiBuilder.group(
  GroundtruthApi,
  "board",
  Effect.fn(function* (handlers) {
    const boards = yield* BoardService;
    const identity = yield* IdentityService;

    return handlers
      .handle(
        "getBoard",
        Effect.fn(function* ({ params, query }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return query.dashboardId === undefined
            ? yield* boards.getDefaultBoard(params.projectId)
            : yield* boards.getBoard(params.projectId, query.dashboardId);
        }),
      )
      .handle(
        "createPanel",
        Effect.fn(function* ({ params, payload }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* boards.createPanel(params.projectId, payload);
        }),
      )
      .handle(
        "updatePanel",
        Effect.fn(function* ({ params, payload }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* boards.updatePanel(params.projectId, params.panelId, payload);
        }),
      )
      .handle(
        "removePanel",
        Effect.fn(function* ({ params }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          yield* boards.removePanel(params.projectId, params.panelId);
        }),
      )
      .handle(
        "annotatePanel",
        Effect.fn(function* ({ params, payload }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* boards.annotatePanel(params.projectId, params.panelId, payload);
        }),
      );
  }),
);
