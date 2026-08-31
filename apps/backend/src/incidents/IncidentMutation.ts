import type { IncidentDetail } from "@groundtruth/api-contract";
import type {
  Hypothesis,
  HypothesisId,
  HypothesisStatus,
  Incident,
  NonEmptyText,
  QuotaExceeded,
  TimelineHypothesis,
  TimelineNote,
} from "@groundtruth/domain";

export interface IncidentMutation {
  readonly detail: IncidentDetail;
  readonly changed: boolean;
}

export interface HypothesisInput {
  readonly hypothesisId?: HypothesisId | undefined;
  readonly text: NonEmptyText;
  readonly status: HypothesisStatus;
}

export interface HypothesisMutation {
  readonly hypothesis: Hypothesis;
  readonly entry: TimelineHypothesis;
  readonly incident: Incident;
}

export type HypothesisOutcome =
  | HypothesisMutation
  | QuotaExceeded
  | "missing-incident"
  | "missing-hypothesis"
  | "closed";

export type NoteOutcome = TimelineNote | QuotaExceeded | "missing" | "closed";
export type CloseOutcome = IncidentDetail | QuotaExceeded | "missing" | "closed" | "firing-alert";
