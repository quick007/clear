import { GroundtruthApi, ManualAlertList } from "@groundtruth/api-contract";
import { EntityNotFound, IncidentTitle } from "@groundtruth/domain";
import { Effect, Option } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AlertService } from "../alerts/AlertService.js";
import { ManualAlertService } from "../alerts/ManualAlertService.js";
import { IdentityService } from "../identity/IdentityService.js";
import { IncidentService } from "../incidents/IncidentService.js";
import { authorizeCurrentProject } from "./ApiMiddleware.js";

export const AlertHandlers = HttpApiBuilder.group(
  GroundtruthApi,
  "alerts",
  Effect.fn(function* (handlers) {
    const alerts = yield* AlertService;
    const manualAlerts = yield* ManualAlertService;
    const identity = yield* IdentityService;
    const incidents = yield* IncidentService;

    return handlers
      .handle(
        "createAlert",
        Effect.fn(function* ({ params, payload }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* alerts.create(params.projectId, payload);
        }),
      )
      .handle(
        "deleteAlert",
        Effect.fn(function* ({ params }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          yield* alerts.delete(params.projectId, params.alertId);
        }),
      )
      .handle(
        "listManualAlerts",
        Effect.fn(function* ({ params }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return new ManualAlertList({ items: yield* manualAlerts.list(params.projectId) });
        }),
      )
      .handle(
        "createManualAlert",
        Effect.fn(function* ({ params, payload }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* manualAlerts.create(params.projectId, {
            title: payload.title,
            severity: payload.severity,
            serviceName: payload.serviceName ?? null,
            context: payload.context ?? null,
          });
        }),
      )
      .handle(
        "startInvestigation",
        Effect.fn(function* ({ params, payload }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          const manual = yield* manualAlerts.find(params.projectId, params.alertId).pipe(
            Effect.map(Option.some),
            Effect.catchTag("EntityNotFound", () => Effect.succeed(Option.none())),
          );
          const threshold = (yield* incidents.listAlerts(params.projectId, {})).find(
            (alert) => alert.id === params.alertId,
          );
          const source = Option.getOrUndefined(manual) ?? threshold;
          if (source === undefined) {
            return yield* new EntityNotFound({
              entity: "alert",
              id: params.alertId,
              message: "Alert not found",
            });
          }
          const title =
            payload.title ?? IncidentTitle.make("title" in source ? source.title : source.name);
          return yield* incidents.openIncident(params.projectId, title);
        }),
      );
  }),
);
