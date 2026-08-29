import { ConsoleOverview, GroundtruthApi, ServiceUnavailable } from "@groundtruth/api-contract";
import type { Alert } from "@groundtruth/domain";
import type { TelemetryUnavailable } from "@groundtruth/telemetry";
import { DateTime, Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { BoardService } from "../board/BoardService.js";
import { DeployService } from "../deploys/DeployService.js";
import { IdentityService } from "../identity/IdentityService.js";
import { IncidentService } from "../incidents/IncidentService.js";
import { TelemetryStore } from "../telemetry/TelemetryStore.js";
import { authorizeCurrentProject } from "./ApiMiddleware.js";

const windowMilliseconds = {
  "5m": 5 * 60 * 1_000, // 5 minutes
  "15m": 15 * 60 * 1_000, // 15 minutes
  "1h": 60 * 60 * 1_000, // 1 hour
  "3h": 3 * 60 * 60 * 1_000, // 3 hours
  "6h": 6 * 60 * 60 * 1_000, // 6 hours
  "12h": 12 * 60 * 60 * 1_000, // 12 hours
  "24h": 24 * 60 * 60 * 1_000, // 24 hours
  "7d": 7 * 24 * 60 * 60 * 1_000, // 7 days
} as const;

const unavailable = (error: TelemetryUnavailable) =>
  new ServiceUnavailable({ service: "telemetry", message: error.message });

const withinWindow = (
  alerts: ReadonlyArray<Alert>,
  window: keyof typeof windowMilliseconds | undefined,
  now: DateTime.Utc,
) => {
  if (window === undefined) return alerts;
  const earliest = DateTime.toEpochMillis(now) - windowMilliseconds[window];
  return alerts.filter((alert) => DateTime.toEpochMillis(alert.updatedAt) >= earliest);
};

export const suggestedNextSteps = (
  hasIncident: boolean,
  serviceCount: number,
  delayedSignals: boolean,
) => {
  if (hasIncident) {
    return [
      "Review the firing alerts and affected services",
      "Compare current signals with the healthy baseline",
      "Inspect correlated traces and error logs",
    ];
  }
  if (serviceCount === 0) {
    return [
      "Connect an OpenTelemetry exporter",
      "Send metrics, logs, and traces to populate this project",
    ];
  }
  return delayedSignals
    ? ["Review delayed telemetry signals", "Inspect recent alerts"]
    : ["Review recent alerts", "Build a panel from the metric catalog"];
};

export const OverviewHandlers = HttpApiBuilder.group(
  GroundtruthApi,
  "overview",
  Effect.fn(function* (handlers) {
    const boards = yield* BoardService;
    const deploys = yield* DeployService;
    const identity = yield* IdentityService;
    const incidents = yield* IncidentService;
    const telemetry = yield* TelemetryStore;

    return handlers
      .handle(
        "getOverview",
        Effect.fn(function* ({ params }) {
          const project = yield* authorizeCurrentProject(identity, params.projectId);
          const now = yield* DateTime.now;
          const result = yield* Effect.all(
            {
              services: telemetry.listServices(params.projectId),
              signalHealth: telemetry.signalHealth(params.projectId),
              alerts: incidents.listAlerts(params.projectId, {}),
              openIncident: incidents.getOpenIncident(params.projectId),
              dashboards: boards.listDashboards(params.projectId),
              recentDeploys: deploys.list(params.projectId, { limit: 10 }),
            },
            { concurrency: "unbounded" },
          ).pipe(Effect.catchTag("TelemetryUnavailable", unavailable));
          return new ConsoleOverview({
            project,
            services: result.services,
            signalHealth: result.signalHealth,
            alerts: result.alerts,
            openIncident: result.openIncident,
            dashboards: result.dashboards,
            recentDeploys: result.recentDeploys.events,
            suggestedNextSteps: suggestedNextSteps(
              result.openIncident !== null,
              result.services.length,
              result.signalHealth.some((signal) => signal.status !== "healthy"),
            ),
            generatedAt: now,
          });
        }),
      )
      .handle(
        "listServices",
        Effect.fn(function* ({ params }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          return yield* telemetry
            .listServices(params.projectId)
            .pipe(Effect.catchTag("TelemetryUnavailable", unavailable));
        }),
      )
      .handle(
        "listAlerts",
        Effect.fn(function* ({ params, query }) {
          yield* authorizeCurrentProject(identity, params.projectId);
          const now = yield* DateTime.now;
          const alerts = yield* incidents.listAlerts(params.projectId, {
            status: query.status,
            severity: query.severity,
            service: query.service,
          });
          return withinWindow(alerts, query.window, now);
        }),
      );
  }),
);
