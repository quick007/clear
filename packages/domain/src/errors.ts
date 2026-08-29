import { Schema } from "effect";
import { AlertAggregation } from "./alerts.ts";
import { ProjectId } from "./ids.ts";

const Message = Schema.String.check(Schema.isLengthBetween(1, 1_000));

export const EntityKind = Schema.Literals([
  "account",
  "project",
  "dashboard",
  "panel",
  "incident",
  "alert",
  "hypothesis",
  "timeline-entry",
  "deploy-event",
  "session",
  "ingest-key",
]);
export type EntityKind = typeof EntityKind.Type;

export class EntityNotFound extends Schema.TaggedError<EntityNotFound>()("EntityNotFound", {
  entity: EntityKind,
  id: Schema.String,
  message: Message,
}) {}

export class AccessDenied extends Schema.TaggedError<AccessDenied>()("AccessDenied", {
  projectId: ProjectId,
  action: Schema.String,
  message: Message,
}) {}

export class ProjectDeleting extends Schema.TaggedError<ProjectDeleting>()("ProjectDeleting", {
  projectId: ProjectId,
  message: Message,
}) {}

export class ResourceConflict extends Schema.TaggedError<ResourceConflict>()("ResourceConflict", {
  resource: EntityKind,
  message: Message,
}) {}

export class InvalidStateTransition extends Schema.TaggedError<InvalidStateTransition>()(
  "InvalidStateTransition",
  {
    resource: EntityKind,
    from: Schema.String,
    to: Schema.String,
    message: Message,
  },
) {}

export class QuotaExceeded extends Schema.TaggedError<QuotaExceeded>()("QuotaExceeded", {
  quota: Schema.String,
  limit: Schema.Number,
  observed: Schema.Number,
  message: Message,
}) {}

export class UnsupportedAlertAggregation extends Schema.TaggedError<UnsupportedAlertAggregation>()(
  "UnsupportedAlertAggregation",
  {
    aggregation: AlertAggregation,
    missingField: Schema.Literal("distinctKey"),
    message: Message,
  },
) {}

export class InvalidCursor extends Schema.TaggedError<InvalidCursor>()("InvalidCursor", {
  rawCursor: Schema.String,
  message: Message,
}) {}

export const IngestKeyRejectionReason = Schema.Literals([
  "missing",
  "malformed",
  "unknown",
  "revoked",
]);
export type IngestKeyRejectionReason = typeof IngestKeyRejectionReason.Type;

export class IngestKeyRejected extends Schema.TaggedError<IngestKeyRejected>()(
  "IngestKeyRejected",
  {
    reason: IngestKeyRejectionReason,
    message: Message,
  },
) {}

export const DomainError = Schema.Union([
  EntityNotFound,
  AccessDenied,
  ProjectDeleting,
  ResourceConflict,
  InvalidStateTransition,
  QuotaExceeded,
  UnsupportedAlertAggregation,
  InvalidCursor,
  IngestKeyRejected,
]).pipe(Schema.toTaggedUnion("_tag"));
export type DomainError = typeof DomainError.Type;
