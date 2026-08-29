import { DeployEventId, NonEmptyText } from "@groundtruth/domain";
import { Schema } from "effect";

export class PanelNoteAnnotation extends Schema.TaggedClass<PanelNoteAnnotation>(
  "Groundtruth/Persistence/PanelNoteAnnotation",
)("note", {
  at: Schema.DateTimeUtcFromString,
  label: NonEmptyText,
}) {}

export class PanelDeployAnnotation extends Schema.TaggedClass<PanelDeployAnnotation>(
  "Groundtruth/Persistence/PanelDeployAnnotation",
)("deploy", {
  at: Schema.DateTimeUtcFromString,
  label: NonEmptyText,
  deployEventId: DeployEventId,
}) {}

export const PanelAnnotationRecord = Schema.Union([
  PanelNoteAnnotation,
  PanelDeployAnnotation,
]).pipe(Schema.toTaggedUnion("_tag"));
export type PanelAnnotationRecord = typeof PanelAnnotationRecord.Type;
export type EncodedPanelAnnotationRecord = typeof PanelAnnotationRecord.Encoded;
