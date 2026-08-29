import {
  DashboardId,
  DashboardMetadata,
  DeployEventId,
  PanelId,
  PanelMetadata,
} from "@groundtruth/domain";
import { PanelSpec } from "@groundtruth/panel-dsl";
import { Schema } from "effect";

export class NoteAnnotation extends Schema.TaggedClass<NoteAnnotation>(
  "Groundtruth/Api/NoteAnnotation",
)("note", {
  at: Schema.DateTimeUtcFromString,
  label: Schema.String.check(Schema.isLengthBetween(1, 500)),
}) {}

export class DeployAnnotation extends Schema.TaggedClass<DeployAnnotation>(
  "Groundtruth/Api/DeployAnnotation",
)("deploy", {
  at: Schema.DateTimeUtcFromString,
  label: Schema.String.check(Schema.isLengthBetween(1, 500)),
  deployEventId: DeployEventId,
}) {}

export const PanelAnnotation = Schema.Union([NoteAnnotation, DeployAnnotation]).pipe(
  Schema.toTaggedUnion("_tag"),
);
export type PanelAnnotation = typeof PanelAnnotation.Type;

export class PanelView extends Schema.Class<PanelView>("Groundtruth/Api/PanelView")({
  metadata: PanelMetadata,
  spec: PanelSpec,
  annotations: Schema.Array(PanelAnnotation),
}) {}

export class BoardState extends Schema.Class<BoardState>("Groundtruth/Api/BoardState")({
  dashboard: DashboardMetadata,
  panels: Schema.Array(PanelView),
  revision: Schema.Natural,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export class CreatePanelRequest extends Schema.Class<CreatePanelRequest>(
  "Groundtruth/Api/CreatePanelRequest",
)({
  dashboardId: DashboardId,
  spec: PanelSpec,
  position: Schema.optional(Schema.Natural),
}) {}

export class UpdatePanelRequest extends Schema.Class<UpdatePanelRequest>(
  "Groundtruth/Api/UpdatePanelRequest",
)({
  spec: PanelSpec,
  position: Schema.optional(Schema.Natural),
  expectedRevision: Schema.Natural,
}) {}

export class AnnotatePanelRequest extends Schema.Class<AnnotatePanelRequest>(
  "Groundtruth/Api/AnnotatePanelRequest",
)({
  at: Schema.DateTimeUtcFromString,
  label: Schema.String.check(Schema.isLengthBetween(1, 500)),
}) {}

export const PanelPath = {
  panelId: PanelId,
} as const;
