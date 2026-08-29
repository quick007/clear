import { IncidentDetail } from "@groundtruth/api-contract";
import { Alert, Incident, type NonEmptyText, type TimelineEntry } from "@groundtruth/domain";
import type { DateTime } from "effect";

const copyAlert = (
  alert: Alert,
  change: {
    readonly status: Alert["status"];
    readonly summary: Alert["summary"];
    readonly firingSince: Alert["firingSince"];
    readonly resolvedAt: Alert["resolvedAt"];
    readonly updatedAt: DateTime.Utc;
  },
) =>
  new Alert({
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
    status: change.status,
    summary: change.summary,
    enabled: alert.enabled,
    firingSince: change.firingSince,
    resolvedAt: change.resolvedAt,
    createdAt: alert.createdAt,
    updatedAt: change.updatedAt,
  });

export const markAlertFiring = (alert: Alert, now: DateTime.Utc) =>
  copyAlert(alert, {
    status: "firing",
    summary: "Request rate is above the expected operating range",
    firingSince: now,
    resolvedAt: null,
    updatedAt: now,
  });

export const markAlertResolved = (alert: Alert, now: DateTime.Utc) =>
  copyAlert(alert, {
    status: "resolved",
    summary: "Telemetry returned to the expected range",
    firingSince: alert.firingSince,
    resolvedAt: now,
    updatedAt: now,
  });

export const touchIncident = (incident: Incident, now: DateTime.Utc) =>
  new Incident({
    id: incident.id,
    projectId: incident.projectId,
    title: incident.title,
    status: incident.status,
    summary: incident.summary,
    openedAt: incident.openedAt,
    closedAt: incident.closedAt,
    createdAt: incident.createdAt,
    updatedAt: now,
  });

export const closeIncident = (incident: Incident, summary: NonEmptyText, now: DateTime.Utc) =>
  new Incident({
    id: incident.id,
    projectId: incident.projectId,
    title: incident.title,
    status: "closed",
    summary,
    openedAt: incident.openedAt,
    closedAt: now,
    createdAt: incident.createdAt,
    updatedAt: now,
  });

export const appendTimeline = (
  detail: IncidentDetail,
  entry: TimelineEntry,
  incident = detail.incident,
) =>
  new IncidentDetail({
    incident,
    hypotheses: detail.hypotheses,
    timeline: [...detail.timeline, entry],
  });
