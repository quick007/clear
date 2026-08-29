import {
  Alert,
  DashboardId,
  DeployEvent,
  Incident,
  PanelId,
  ProjectId,
  TimelineEntry,
} from "@groundtruth/domain";
import { SignalActivity } from "@groundtruth/telemetry";
import { Schema } from "effect";
import { EventCursor } from "./common.ts";

export const LiveEventId = Schema.String.check(Schema.isUUID(7)).pipe(Schema.brand("LiveEventId"));
export type LiveEventId = typeof LiveEventId.Type;

const durableEvent = {
  eventId: LiveEventId,
  projectId: ProjectId,
  occurredAt: Schema.DateTimeUtcFromString,
} as const;

export class AlertChanged extends Schema.TaggedClass<AlertChanged>("Groundtruth/Api/AlertChanged")(
  "AlertChanged",
  {
    ...durableEvent,
    alert: Alert,
    change: Schema.Literals(["created", "updated", "deleted"]),
  },
) {}

export class IncidentChanged extends Schema.TaggedClass<IncidentChanged>(
  "Groundtruth/Api/IncidentChanged",
)("IncidentChanged", {
  ...durableEvent,
  incident: Incident,
  change: Schema.Literals(["opened", "updated", "closed"]),
}) {}

export class TimelineEntryAdded extends Schema.TaggedClass<TimelineEntryAdded>(
  "Groundtruth/Api/TimelineEntryAdded",
)("TimelineEntryAdded", {
  ...durableEvent,
  entry: TimelineEntry,
}) {}

export class PanelChanged extends Schema.TaggedClass<PanelChanged>("Groundtruth/Api/PanelChanged")(
  "PanelChanged",
  {
    ...durableEvent,
    dashboardId: DashboardId,
    panelId: PanelId,
    revision: Schema.Natural,
    change: Schema.Literals(["created", "updated", "removed", "annotated"]),
  },
) {}

export class BoardChanged extends Schema.TaggedClass<BoardChanged>("Groundtruth/Api/BoardChanged")(
  "BoardChanged",
  {
    ...durableEvent,
    dashboardId: DashboardId,
    revision: Schema.Natural,
  },
) {}

export class DeployRecorded extends Schema.TaggedClass<DeployRecorded>(
  "Groundtruth/Api/DeployRecorded",
)("DeployRecorded", {
  ...durableEvent,
  deploy: DeployEvent,
}) {}

export class TelemetryActivityObserved extends Schema.TaggedClass<TelemetryActivityObserved>(
  "Groundtruth/Api/TelemetryActivityObserved",
)("TelemetryActivityObserved", {
  projectId: ProjectId,
  occurredAt: Schema.DateTimeUtcFromString,
  activity: SignalActivity,
}) {}

export class Heartbeat extends Schema.TaggedClass<Heartbeat>("Groundtruth/Api/Heartbeat")(
  "Heartbeat",
  {
    occurredAt: Schema.DateTimeUtcFromString,
    cursor: Schema.NullOr(EventCursor),
  },
) {}

const ProductStateValue = Schema.Union([
  Schema.String,
  Schema.Finite,
  Schema.Boolean,
  Schema.Null,
  Schema.Array(Schema.String),
]);

export class ProductStateChanged extends Schema.TaggedClass<ProductStateChanged>(
  "Groundtruth/Api/ProductStateChanged",
)("ProductStateChanged", {
  cursor: EventCursor,
  projectId: ProjectId,
  occurredAt: Schema.DateTimeUtcFromString,
  kind: Schema.String.check(Schema.isLengthBetween(1, 100)),
  schemaVersion: Schema.Int.check(Schema.isGreaterThan(0)),
  payload: Schema.Record(Schema.String, ProductStateValue),
}) {}

export class ResyncRequired extends Schema.TaggedClass<ResyncRequired>(
  "Groundtruth/Api/ResyncRequired",
)("ResyncRequired", {
  occurredAt: Schema.DateTimeUtcFromString,
  reason: Schema.Literals(["cursor-missing", "cursor-expired", "stream-overflow"]),
  earliestCursor: Schema.NullOr(EventCursor),
  latestCursor: Schema.NullOr(EventCursor),
}) {}

export const LiveEvent = Schema.Union([
  AlertChanged,
  IncidentChanged,
  TimelineEntryAdded,
  PanelChanged,
  BoardChanged,
  DeployRecorded,
  ProductStateChanged,
  TelemetryActivityObserved,
  Heartbeat,
  ResyncRequired,
]).pipe(Schema.toTaggedUnion("_tag"));
export type LiveEvent = typeof LiveEvent.Type;

export const LiveEventQuery = {
  cursor: Schema.optional(EventCursor),
} as const;
