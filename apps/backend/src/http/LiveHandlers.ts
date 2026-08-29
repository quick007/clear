import { CurrentSession, GroundtruthApi } from "@groundtruth/api-contract";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { IdentityService } from "../identity/IdentityService.js";
import { LiveEventBus } from "../live/LiveEventBus.js";

export const LiveHandlers = HttpApiBuilder.group(
  GroundtruthApi,
  "live",
  Effect.fn(function* (handlers) {
    const identity = yield* IdentityService;
    const events = yield* LiveEventBus;

    return handlers.handle(
      "stream",
      Effect.fn(function* ({ params, query }) {
        const session = yield* CurrentSession;
        yield* identity.authorizeProject(session, params.projectId);
        return yield* events.stream(params.projectId, query.cursor);
      }),
    );
  }),
);
