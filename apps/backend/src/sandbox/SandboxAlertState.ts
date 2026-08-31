import {
  Alert,
  type AlertId,
  AlertName,
  NonEmptyText,
  type ProjectId,
  ServiceName,
} from "@groundtruth/domain";
import { DateTime, Effect, Ref } from "effect";
import type { IncidentService } from "../incidents/IncidentService.js";
import type { IncidentState } from "../incidents/IncidentState.js";

const requestRateAlertName = AlertName.make("Checkout upstream request rate");
const checkoutService = ServiceName.make("checkout-api");

export const seedSandboxIncidentProject = Effect.fn("SandboxAlertState.seedIncidentProject")(
  function* (
    incidentState: IncidentState["Service"],
    projectId: ProjectId,
    id: AlertId,
    now: DateTime.Utc,
  ) {
    yield* Ref.update(incidentState.state, (all) => {
      if (all.has(projectId)) return all;
      const alert = new Alert({
        id,
        projectId,
        name: requestRateAlertName,
        serviceName: checkoutService,
        metricName: "upstream.client.requests",
        aggregation: "rate",
        comparison: "at-or-above",
        threshold: 90,
        windowSeconds: 5,
        severity: "critical",
        status: "healthy",
        summary: null,
        enabled: true,
        firingSince: null,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return new Map(all).set(projectId, {
        detail: null,
        alerts: [alert],
        manualAlerts: [],
      });
    });
  },
);

export const markSandboxRequestRateFiring = Effect.fn("SandboxAlertState.markRequestRateFiring")(
  function* (
    incidentState: IncidentState["Service"],
    projectId: ProjectId,
    now: DateTime.Utc,
    summary: string,
  ) {
    return yield* Ref.modify(incidentState.state, (all) => {
      const current = all.get(projectId);
      if (current === undefined) return [null, all];
      let updated: Alert | null = null;
      const alerts = current.alerts.map((alert) => {
        if (alert.name !== requestRateAlertName || alert.status === "firing") return alert;
        updated = new Alert({
          id: alert.id,
          projectId: alert.projectId,
          name: alert.name,
          serviceName: alert.serviceName,
          metricName: alert.metricName,
          aggregation: alert.aggregation,
          comparison: alert.comparison,
          threshold: alert.threshold,
          windowSeconds: alert.windowSeconds,
          severity: alert.severity,
          status: "firing",
          summary,
          enabled: alert.enabled,
          firingSince: now,
          resolvedAt: null,
          createdAt: alert.createdAt,
          updatedAt: now,
        });
        return updated;
      });
      return [
        updated,
        updated === null ? all : new Map(all).set(projectId, { ...current, alerts }),
      ];
    });
  },
);

export const markSandboxRequestRateResolved = Effect.fn(
  "SandboxAlertState.markRequestRateResolved",
)(function* (
  incidentState: IncidentState["Service"],
  projectId: ProjectId,
  now: DateTime.Utc,
  summary: string,
) {
  return yield* Ref.modify(incidentState.state, (all) => {
    const current = all.get(projectId);
    if (current === undefined) return [null, all];
    let updated: Alert | null = null;
    const alerts = current.alerts.map((alert) => {
      if (alert.name !== requestRateAlertName || alert.status !== "firing") return alert;
      updated = new Alert({
        id: alert.id,
        projectId: alert.projectId,
        name: alert.name,
        serviceName: alert.serviceName,
        metricName: alert.metricName,
        aggregation: alert.aggregation,
        comparison: alert.comparison,
        threshold: alert.threshold,
        windowSeconds: alert.windowSeconds,
        severity: alert.severity,
        status: "resolved",
        summary,
        enabled: alert.enabled,
        firingSince: alert.firingSince,
        resolvedAt: now,
        createdAt: alert.createdAt,
        updatedAt: now,
      });
      return updated;
    });
    return [updated, updated === null ? all : new Map(all).set(projectId, { ...current, alerts })];
  });
});

export const recordSandboxScenarioNote = Effect.fn("SandboxAlertState.recordScenarioNote")(
  function* (incidents: IncidentService["Service"], projectId: ProjectId, text: string) {
    const incident = yield* incidents.getOpenIncident(projectId);
    if (incident === null) return;
    yield* incidents.addNote(projectId, incident.id, NonEmptyText.make(text)).pipe(
      Effect.catchTags({
        EntityNotFound: () => Effect.void,
        InvalidStateTransition: () => Effect.void,
        QuotaExceeded: () => Effect.void,
      }),
    );
  },
);
