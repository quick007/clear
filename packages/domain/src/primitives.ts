import { Schema } from "effect";

const text = (maximum: number) =>
  Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, maximum));

export const DisplayName = text(120).pipe(Schema.brand("DisplayName"));
export type DisplayName = typeof DisplayName.Type;

export const ProjectName = text(120).pipe(Schema.brand("ProjectName"));
export type ProjectName = typeof ProjectName.Type;

export const DashboardName = text(120).pipe(Schema.brand("DashboardName"));
export type DashboardName = typeof DashboardName.Type;

export const PanelTitle = text(160).pipe(Schema.brand("PanelTitle"));
export type PanelTitle = typeof PanelTitle.Type;

export const IngestKeyName = text(120).pipe(Schema.brand("IngestKeyName"));
export type IngestKeyName = typeof IngestKeyName.Type;

export const AlertName = text(120).pipe(Schema.brand("AlertName"));
export type AlertName = typeof AlertName.Type;

export const IncidentTitle = text(160).pipe(Schema.brand("IncidentTitle"));
export type IncidentTitle = typeof IncidentTitle.Type;

export const ProjectSlug = Schema.String.check(
  Schema.isLengthBetween(2, 63),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
).pipe(Schema.brand("ProjectSlug"));
export type ProjectSlug = typeof ProjectSlug.Type;

export const ServiceName = text(255).pipe(Schema.brand("ServiceName"));
export type ServiceName = typeof ServiceName.Type;

export const HostedSubject = text(255).pipe(Schema.brand("HostedSubject")).annotate({
  description: "Provider account key. Hosted v1 uses the normalized verified ChatGPT email.",
});
export type HostedSubject = typeof HostedSubject.Type;

export const EmailAddress = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isLengthBetween(3, 320),
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
).pipe(Schema.brand("EmailAddress"));
export type EmailAddress = typeof EmailAddress.Type;

export const Sha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{7,64}$/)).pipe(
  Schema.brand("Sha"),
);
export type Sha = typeof Sha.Type;

export const Url = Schema.String.check(
  Schema.isLengthBetween(1, 2_048),
  Schema.isPattern(/^https?:\/\//),
).pipe(Schema.brand("Url"));
export type Url = typeof Url.Type;

export const NonEmptyText = text(10_000);
export type NonEmptyText = typeof NonEmptyText.Type;

export const DeploymentMode = Schema.Literals(["sandbox", "hosted", "self-hosted"]);
export type DeploymentMode = typeof DeploymentMode.Type;

export const ProjectMode = Schema.Literals(["hosted", "self-hosted"]);
export type ProjectMode = typeof ProjectMode.Type;

export const ProjectLifecycle = Schema.Literals([
  "active",
  "deletion-requested",
  "deleting",
  "deletion-failed",
]);
export type ProjectLifecycle = typeof ProjectLifecycle.Type;

export const IngestKeyStatus = Schema.Literals(["active", "revoked"]);
export type IngestKeyStatus = typeof IngestKeyStatus.Type;

export const AlertSeverity = Schema.Literals(["info", "warning", "critical"]);
export type AlertSeverity = typeof AlertSeverity.Type;

export const AlertStatus = Schema.Literals(["healthy", "firing", "resolved"]);
export type AlertStatus = typeof AlertStatus.Type;

export const IncidentStatus = Schema.Literals(["open", "closed"]);
export type IncidentStatus = typeof IncidentStatus.Type;

export const HypothesisStatus = Schema.Literals(["proposed", "testing", "rejected", "confirmed"]);
export type HypothesisStatus = typeof HypothesisStatus.Type;

export const TimelineEntryKind = Schema.Literals([
  "note",
  "hypothesis",
  "deploy",
  "incident-status",
]);
export type TimelineEntryKind = typeof TimelineEntryKind.Type;
