import {
  Hypothesis,
  HypothesisId,
  HypothesisStatus,
  Incident,
  IncidentId,
  IncidentTitle,
  NonEmptyText,
  TimelineEntry,
} from "@groundtruth/domain";
import { Schema } from "effect";

export class IncidentDetail extends Schema.Class<IncidentDetail>("Groundtruth/Api/IncidentDetail")({
  incident: Incident,
  hypotheses: Schema.Array(Hypothesis),
  timeline: Schema.Array(TimelineEntry),
}) {}

export class IncidentList extends Schema.Class<IncidentList>("Groundtruth/Api/IncidentList")({
  items: Schema.Array(Incident),
}) {}

export class OpenIncidentRequest extends Schema.Class<OpenIncidentRequest>(
  "Groundtruth/Api/OpenIncidentRequest",
)({
  title: IncidentTitle,
}) {}

export class SetHypothesisRequest extends Schema.Class<SetHypothesisRequest>(
  "Groundtruth/Api/SetHypothesisRequest",
)({
  hypothesisId: Schema.optional(HypothesisId),
  text: NonEmptyText,
  status: HypothesisStatus,
}) {}

export class AddTimelineNoteRequest extends Schema.Class<AddTimelineNoteRequest>(
  "Groundtruth/Api/AddTimelineNoteRequest",
)({
  text: NonEmptyText,
}) {}

export class CloseIncidentRequest extends Schema.Class<CloseIncidentRequest>(
  "Groundtruth/Api/CloseIncidentRequest",
)({
  summary: NonEmptyText,
}) {}

export const IncidentPath = {
  incidentId: IncidentId,
} as const;
