import { Schema } from "effect";
import { DashboardId, IngestKeyId, PanelId, ProjectId, UserId } from "./ids.ts";
import {
  DashboardName,
  IngestKeyName,
  IngestKeyStatus,
  NonEmptyText,
  PanelTitle,
  ProjectLifecycle,
  ProjectMode,
  ProjectName,
  ProjectSlug,
} from "./primitives.ts";

export class Project extends Schema.Class<Project>("Groundtruth/Project")({
  id: ProjectId,
  ownerId: UserId,
  slug: ProjectSlug,
  name: ProjectName,
  mode: ProjectMode,
  lifecycle: ProjectLifecycle,
  retentionDays: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 365 })),
  deletionRequestedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  deletionFailure: Schema.NullOr(NonEmptyText),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export class DashboardMetadata extends Schema.Class<DashboardMetadata>(
  "Groundtruth/DashboardMetadata",
)({
  id: DashboardId,
  projectId: ProjectId,
  name: DashboardName,
  description: Schema.NullOr(NonEmptyText),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export class PanelMetadata extends Schema.Class<PanelMetadata>("Groundtruth/PanelMetadata")({
  id: PanelId,
  projectId: ProjectId,
  dashboardId: DashboardId,
  title: PanelTitle,
  position: Schema.Natural,
  revision: Schema.Natural,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export class IngestKeyMetadata extends Schema.Class<IngestKeyMetadata>(
  "Groundtruth/IngestKeyMetadata",
)({
  id: IngestKeyId,
  projectId: ProjectId,
  name: IngestKeyName,
  prefix: Schema.String.check(Schema.isLengthBetween(6, 32)),
  status: IngestKeyStatus,
  createdAt: Schema.DateTimeUtcFromString,
  lastUsedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  revokedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
}) {}
