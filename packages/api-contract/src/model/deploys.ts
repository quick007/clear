import { DeployEvent, NonEmptyText, ServiceName, Sha, Url } from "@groundtruth/domain";
import { Schema } from "effect";
import { Cursor, PageLimitFromString, QueryWindow } from "./common.ts";

export const DeployListQuery = {
  service: Schema.optional(ServiceName),
  window: Schema.optional(QueryWindow),
  cursor: Schema.optional(Cursor),
  limit: Schema.optional(PageLimitFromString),
} as const;

export class DeployEventPage extends Schema.Class<DeployEventPage>(
  "Groundtruth/Api/DeployEventPage",
)({
  events: Schema.Array(DeployEvent),
  nextCursor: Schema.NullOr(Cursor),
  hasMore: Schema.Boolean,
}) {}

export class RecordDeployEventRequest extends Schema.Class<RecordDeployEventRequest>(
  "Groundtruth/Api/RecordDeployEventRequest",
)({
  service: ServiceName,
  sha: Sha,
  description: Schema.optional(NonEmptyText),
  url: Schema.optional(Url),
  deployedAt: Schema.optional(Schema.DateTimeUtcFromString),
}) {}
