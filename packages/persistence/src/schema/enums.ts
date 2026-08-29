import { pgEnum } from "drizzle-orm/pg-core";

export const projectLifecycleEnum = pgEnum("project_lifecycle", [
  "active",
  "deletion-requested",
  "deleting",
  "deletion-failed",
]);

export const projectModeEnum = pgEnum("project_mode", ["hosted", "self-hosted"]);

export const alertSeverityEnum = pgEnum("alert_severity", ["info", "warning", "critical"]);

export const alertStatusEnum = pgEnum("alert_status", ["healthy", "firing", "resolved"]);

export const incidentStatusEnum = pgEnum("incident_status", ["open", "closed"]);

export const hypothesisStatusEnum = pgEnum("hypothesis_status", [
  "proposed",
  "testing",
  "rejected",
  "confirmed",
]);

export const timelineEntryKindEnum = pgEnum("timeline_entry_kind", [
  "note",
  "hypothesis",
  "deploy",
  "incident-status",
]);

export const outboxEventKindEnum = pgEnum("outbox_event_kind", [
  "project.created",
  "project.updated",
  "project.deletion_requested",
  "project.deletion_progressed",
  "dashboard.created",
  "dashboard.updated",
  "dashboard.removed",
  "panel.created",
  "panel.updated",
  "panel.removed",
  "alert.created",
  "alert.updated",
  "alert.state_changed",
  "incident.opened",
  "incident.updated",
  "incident.closed",
  "hypothesis.changed",
  "timeline.entry_added",
  "deploy.recorded",
  "ingest_key.created",
  "ingest_key.revoked",
]);

export type OutboxEventKind = (typeof outboxEventKindEnum.enumValues)[number];
