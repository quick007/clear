import { GroundtruthApi } from "@groundtruth/api-contract";
import { LogSearch, RelativeTimeRange } from "@groundtruth/telemetry";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { IdentityService } from "../identity/IdentityService.js";
import { TelemetryStore } from "../telemetry/TelemetryStore.js";
import { authorizeCurrentProject } from "./ApiMiddleware.js";

export const TelemetryHandlers = HttpApiBuilder.group(
  GroundtruthApi,
  "telemetry",
  Effect.fn(function* (handlers) {
    const telemetry = yield* TelemetryStore;
    const identity = yield* IdentityService;

    return handlers
      .handle(
        "listMetrics",
        Effect.fn(function* ({ params }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* telemetry.listMetrics(params.projectId);
        }),
      )
      .handle(
        "queryMetrics",
        Effect.fn(function* ({ params, payload }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* telemetry.queryMetrics(params.projectId, payload);
        }),
      )
      .handle(
        "searchLogs",
        Effect.fn(function* ({ params, payload }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* telemetry.searchLogs(params.projectId, payload);
        }),
      )
      .handle(
        "sampleLogs",
        Effect.fn(function* ({ params, query }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* telemetry.searchLogs(
            params.projectId,
            new LogSearch({
              services: [query.service],
              severities: query.severity === undefined ? undefined : [query.severity],
              range:
                query.window === undefined
                  ? undefined
                  : new RelativeTimeRange({ window: query.window }),
              limit: query.limit,
            }),
          );
        }),
      )
      .handle(
        "searchTraces",
        Effect.fn(function* ({ params, payload }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* telemetry.searchTraces(params.projectId, payload);
        }),
      )
      .handle(
        "getTrace",
        Effect.fn(function* ({ params }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* telemetry.getTrace(params.projectId, params.traceId);
        }),
      );
  }),
);
