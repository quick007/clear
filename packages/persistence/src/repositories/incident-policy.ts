import type { NonEmptyText } from "@groundtruth/domain";

export const IncidentHistoryLimits = {
  timelineEntries: 200,
  hypotheses: 50,
  textCodePoints: 2_000,
  timelineEntriesBeforeClose: 199,
} as const;

export const incidentTextCodePointLength = (text: string) => Array.from(text).length;

export const incidentTextIsWithinLimit = (text: string) =>
  incidentTextCodePointLength(text) <= IncidentHistoryLimits.textCodePoints;

export const truncateIncidentTimelineText = (text: NonEmptyText) =>
  Array.from(text).slice(0, IncidentHistoryLimits.textCodePoints).join("") as NonEmptyText;
