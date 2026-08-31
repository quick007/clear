import {
  Account,
  Alert,
  DashboardMetadata,
  DeployEvent,
  Hypothesis,
  HostedSession,
  Incident,
  IngestKeyMetadata,
  ManualAlert,
  PanelMetadata,
  Project,
  TimelineEntry,
} from "@groundtruth/domain";
import { PanelSpec } from "@groundtruth/panel-dsl";
import { DateTime, Effect, Schema } from "effect";
import { persistenceError } from "../errors.ts";
import { PanelAnnotationRecord } from "../records.ts";
import type {
  accounts,
  alerts,
  dashboards,
  deployEvents,
  hypotheses,
  hostedSessions,
  incidents,
  ingestKeys,
  manualAlerts,
  outboxEvents,
  panels,
  projects,
  timelineEntries,
} from "../schema/index.ts";
import type { DashboardRecord, OutboxEvent, PanelRecord } from "../repositories/contracts.ts";

type AccountRow = typeof accounts.$inferSelect;
type AlertRow = typeof alerts.$inferSelect;
type DashboardRow = typeof dashboards.$inferSelect;
type DeployEventRow = typeof deployEvents.$inferSelect;
type HypothesisRow = typeof hypotheses.$inferSelect;
type HostedSessionRow = typeof hostedSessions.$inferSelect;
type IncidentRow = typeof incidents.$inferSelect;
type IngestKeyRow = typeof ingestKeys.$inferSelect;
type ManualAlertRow = typeof manualAlerts.$inferSelect;
type OutboxRow = typeof outboxEvents.$inferSelect;
type PanelRow = typeof panels.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;
type TimelineRow = typeof timelineEntries.$inferSelect;

const utc = DateTime.fromDateUnsafe;

export const decodeStored = <A>(operation: string, evaluate: () => A) =>
  Effect.try({
    try: evaluate,
    catch: (error) => persistenceError("postgres", `decode-${operation}`, error, false),
  });

export const accountFromRow = (row: AccountRow) =>
  new Account({
    id: row.id,
    hostedSubject: row.hostedSubject,
    email: row.email,
    displayName: row.displayName,
    createdAt: utc(row.createdAt),
    lastSeenAt: utc(row.lastSeenAt),
  });

export const projectFromRow = (row: ProjectRow) =>
  new Project({
    id: row.id,
    ownerId: row.ownerId,
    slug: row.slug,
    name: row.name,
    mode: row.mode,
    lifecycle: row.lifecycle,
    retentionDays: row.retentionDays,
    deletionRequestedAt: row.deletionRequestedAt === null ? null : utc(row.deletionRequestedAt),
    deletionFailure: row.purgeError,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  });

export const ingestKeyFromRow = (row: IngestKeyRow) =>
  new IngestKeyMetadata({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    prefix: row.keyPrefix,
    status: row.revokedAt === null ? "active" : "revoked",
    createdAt: utc(row.createdAt),
    lastUsedAt: row.lastUsedAt === null ? null : utc(row.lastUsedAt),
    revokedAt: row.revokedAt === null ? null : utc(row.revokedAt),
  });

export const dashboardFromRow = (
  row: DashboardRow,
  panelRows: ReadonlyArray<PanelRow>,
): DashboardRecord => ({
  metadata: new DashboardMetadata({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  }),
  isDefault: row.isDefault,
  panels: panelRows.map(panelFromRow),
});

export const panelFromRow = (row: PanelRow): PanelRecord => ({
  metadata: new PanelMetadata({
    id: row.id,
    projectId: row.projectId,
    dashboardId: row.dashboardId,
    title: row.title,
    position: row.position,
    revision: row.revision,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  }),
  spec: Schema.decodeUnknownSync(PanelSpec)(row.spec),
  annotations: Schema.decodeUnknownSync(Schema.Array(PanelAnnotationRecord))(row.annotations),
});

export const alertFromRow = (row: AlertRow) =>
  new Alert({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    serviceName: row.serviceName,
    metricName: row.metricName,
    aggregation: row.aggregation,
    comparison: row.comparison,
    threshold: row.threshold,
    windowSeconds: row.windowSeconds,
    severity: row.severity,
    status: row.status,
    summary: row.summary,
    enabled: row.enabled,
    firingSince: row.firingSince === null ? null : utc(row.firingSince),
    resolvedAt: row.resolvedAt === null ? null : utc(row.resolvedAt),
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  });

export const manualAlertFromRow = (row: ManualAlertRow) =>
  new ManualAlert({
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    severity: row.severity,
    serviceName: row.serviceName,
    context: row.context,
    createdAt: utc(row.createdAt),
  });

export const incidentFromRow = (row: IncidentRow) =>
  new Incident({
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    status: row.status,
    summary: row.summary,
    openedAt: utc(row.openedAt),
    closedAt: row.closedAt === null ? null : utc(row.closedAt),
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  });

export const hypothesisFromRow = (row: HypothesisRow) =>
  new Hypothesis({
    id: row.id,
    projectId: row.projectId,
    incidentId: row.incidentId,
    text: row.text,
    status: row.status,
    createdAt: utc(row.createdAt),
    updatedAt: utc(row.updatedAt),
  });

export const hostedSessionFromRow = (row: HostedSessionRow) =>
  new HostedSession({
    id: row.id,
    userId: row.accountId,
    createdAt: utc(row.createdAt),
    lastSeenAt: utc(row.lastSeenAt),
    expiresAt: utc(row.expiresAt),
  });

export const deployEventFromRow = (row: DeployEventRow) =>
  new DeployEvent({
    id: row.id,
    projectId: row.projectId,
    serviceName: row.serviceName,
    sha: row.sha,
    description: row.description,
    url: row.url,
    deployedAt: utc(row.deployedAt),
    receivedAt: utc(row.receivedAt),
  });

export const outboxFromRow = (row: OutboxRow): OutboxEvent => ({
  sequence: row.sequence,
  projectId: row.projectId,
  kind: row.kind,
  schemaVersion: row.schemaVersion,
  payload: row.payload,
  createdAt: utc(row.createdAt),
});

const timelineEncoded = (row: TimelineRow) => {
  const metadata = row.metadata ?? {};
  const base = {
    _tag: row.kind,
    id: row.id,
    projectId: row.projectId,
    incidentId: row.incidentId,
    occurredAt: row.occurredAt.toISOString(),
  };

  switch (row.kind) {
    case "note":
      return { ...base, text: row.text };
    case "hypothesis":
      return {
        ...base,
        hypothesisId: metadata.hypothesisId,
        text: row.text,
        status: metadata.status,
      };
    case "deploy":
      return {
        ...base,
        deployEventId: metadata.deployEventId,
        serviceName: metadata.serviceName,
        sha: metadata.sha,
      };
    case "incident-status":
      return { ...base, status: metadata.status, summary: metadata.summary ?? null };
  }
};

export const timelineFromRow = (row: TimelineRow) =>
  Schema.decodeUnknownEffect(TimelineEntry)(timelineEncoded(row)).pipe(
    Effect.mapError((error) => persistenceError("postgres", "decode-timeline-entry", error, false)),
  );
