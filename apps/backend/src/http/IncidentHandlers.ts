import { CurrentSession, GroundtruthApi, IncidentList } from "@groundtruth/api-contract";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { IdentityService } from "../identity/IdentityService.js";
import { IncidentService } from "../incidents/IncidentService.js";

export const IncidentHandlers = HttpApiBuilder.group(
  GroundtruthApi,
  "incidents",
  Effect.fn(function* (handlers) {
    const identity = yield* IdentityService;
    const incidents = yield* IncidentService;

    const authorize = Effect.fn("IncidentHandlers.authorize")(function* (projectId) {
      const session = yield* CurrentSession;
      yield* identity.authorizeProject(session, projectId);
    });

    return handlers
      .handle(
        "getIncident",
        Effect.fn(function* ({ params }) {
          yield* authorize(params.projectId);
          return yield* incidents.getDetail(params.projectId, params.incidentId);
        }),
      )
      .handle(
        "listIncidents",
        Effect.fn(function* ({ params }) {
          yield* authorize(params.projectId);
          return new IncidentList({ items: yield* incidents.listIncidents(params.projectId) });
        }),
      )
      .handle(
        "openIncident",
        Effect.fn(function* ({ params, payload }) {
          yield* authorize(params.projectId);
          return yield* incidents.openIncident(params.projectId, payload.title);
        }),
      )
      .handle(
        "setHypothesis",
        Effect.fn(function* ({ params, payload }) {
          yield* authorize(params.projectId);
          return yield* incidents.setHypothesis(params.projectId, params.incidentId, payload);
        }),
      )
      .handle(
        "addTimelineNote",
        Effect.fn(function* ({ params, payload }) {
          yield* authorize(params.projectId);
          return yield* incidents.addNote(params.projectId, params.incidentId, payload.text);
        }),
      )
      .handle(
        "closeIncident",
        Effect.fn(function* ({ params, payload }) {
          yield* authorize(params.projectId);
          return yield* incidents.close(params.projectId, params.incidentId, payload.summary);
        }),
      );
  }),
);
