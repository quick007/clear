import { Schema } from "effect";

const uuidV7 = <const Name extends string>(name: Name) =>
  Schema.String.check(Schema.isUUID(7)).pipe(Schema.brand(name));

export const UserId = uuidV7("UserId");
export type UserId = typeof UserId.Type;

export const ProjectId = uuidV7("ProjectId");
export type ProjectId = typeof ProjectId.Type;

export const DashboardId = uuidV7("DashboardId");
export type DashboardId = typeof DashboardId.Type;

export const PanelId = uuidV7("PanelId");
export type PanelId = typeof PanelId.Type;

export const IncidentId = uuidV7("IncidentId");
export type IncidentId = typeof IncidentId.Type;

export const AlertId = uuidV7("AlertId");
export type AlertId = typeof AlertId.Type;

export const HypothesisId = uuidV7("HypothesisId");
export type HypothesisId = typeof HypothesisId.Type;

export const TimelineEntryId = uuidV7("TimelineEntryId");
export type TimelineEntryId = typeof TimelineEntryId.Type;

export const DeployEventId = uuidV7("DeployEventId");
export type DeployEventId = typeof DeployEventId.Type;

export const SessionId = uuidV7("SessionId");
export type SessionId = typeof SessionId.Type;

export const IngestKeyId = uuidV7("IngestKeyId");
export type IngestKeyId = typeof IngestKeyId.Type;
