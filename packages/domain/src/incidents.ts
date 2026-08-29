import { Schema } from "effect";
import { DeployEventId, HypothesisId, IncidentId, ProjectId, TimelineEntryId } from "./ids.ts";
import {
  HypothesisStatus,
  IncidentTitle,
  IncidentStatus,
  NonEmptyText,
  ServiceName,
  Sha,
  Url,
} from "./primitives.ts";

export class Incident extends Schema.Class<Incident>("Groundtruth/Incident")({
  id: IncidentId,
  projectId: ProjectId,
  title: IncidentTitle,
  status: IncidentStatus,
  summary: Schema.NullOr(NonEmptyText),
  openedAt: Schema.DateTimeUtcFromString,
  closedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export class Hypothesis extends Schema.Class<Hypothesis>("Groundtruth/Hypothesis")({
  id: HypothesisId,
  projectId: ProjectId,
  incidentId: IncidentId,
  text: NonEmptyText,
  status: HypothesisStatus,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export class DeployEvent extends Schema.Class<DeployEvent>("Groundtruth/DeployEvent")({
  id: DeployEventId,
  projectId: ProjectId,
  serviceName: ServiceName,
  sha: Sha,
  description: Schema.NullOr(NonEmptyText),
  url: Schema.NullOr(Url),
  deployedAt: Schema.DateTimeUtcFromString,
  receivedAt: Schema.DateTimeUtcFromString,
}) {}

const timelineBase = {
  id: TimelineEntryId,
  projectId: ProjectId,
  incidentId: IncidentId,
  occurredAt: Schema.DateTimeUtcFromString,
} as const;

export class TimelineNote extends Schema.TaggedClass<TimelineNote>("Groundtruth/TimelineNote")(
  "note",
  {
    ...timelineBase,
    text: NonEmptyText,
  },
) {}

export class TimelineHypothesis extends Schema.TaggedClass<TimelineHypothesis>(
  "Groundtruth/TimelineHypothesis",
)("hypothesis", {
  ...timelineBase,
  hypothesisId: HypothesisId,
  text: NonEmptyText,
  status: HypothesisStatus,
}) {}

export class TimelineDeploy extends Schema.TaggedClass<TimelineDeploy>(
  "Groundtruth/TimelineDeploy",
)("deploy", {
  ...timelineBase,
  deployEventId: DeployEventId,
  serviceName: ServiceName,
  sha: Sha,
}) {}

export class TimelineIncidentStatus extends Schema.TaggedClass<TimelineIncidentStatus>(
  "Groundtruth/TimelineIncidentStatus",
)("incident-status", {
  ...timelineBase,
  status: IncidentStatus,
  summary: Schema.NullOr(NonEmptyText),
}) {}

export const TimelineEntry = Schema.Union([
  TimelineNote,
  TimelineHypothesis,
  TimelineDeploy,
  TimelineIncidentStatus,
]).pipe(Schema.toTaggedUnion("_tag"));
export type TimelineEntry = typeof TimelineEntry.Type;
