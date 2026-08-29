import type { IncidentDetail } from "@groundtruth/api-contract";
import { QuotaExceeded } from "@groundtruth/domain";
import {
  IncidentHistoryLimits,
  incidentTextCodePointLength,
  incidentTextIsWithinLimit,
} from "@groundtruth/persistence";

const quotaExceeded = (quota: string, limit: number, observed: number) =>
  new QuotaExceeded({
    quota,
    limit,
    observed,
    message: `Incident limit reached for ${quota}`,
  });

export const incidentTextQuota = (text: string) =>
  incidentTextIsWithinLimit(text)
    ? null
    : quotaExceeded(
        "incident-text",
        IncidentHistoryLimits.textCodePoints,
        incidentTextCodePointLength(text),
      );

export const incidentTimelineQuotaBeforeClose = (detail: IncidentDetail) =>
  detail.timeline.length >= IncidentHistoryLimits.timelineEntriesBeforeClose
    ? quotaExceeded(
        "incident-timeline",
        IncidentHistoryLimits.timelineEntriesBeforeClose,
        detail.timeline.length + 1,
      )
    : null;

export const incidentTimelineQuotaForClose = (detail: IncidentDetail) =>
  detail.timeline.length >= IncidentHistoryLimits.timelineEntries
    ? quotaExceeded(
        "incident-timeline",
        IncidentHistoryLimits.timelineEntries,
        detail.timeline.length + 1,
      )
    : null;

export const incidentHypothesisQuota = (detail: IncidentDetail) =>
  detail.hypotheses.length >= IncidentHistoryLimits.hypotheses
    ? quotaExceeded(
        "incident-hypotheses",
        IncidentHistoryLimits.hypotheses,
        detail.hypotheses.length + 1,
      )
    : null;

export const incidentTimelineHasMutationCapacity = (detail: IncidentDetail) =>
  detail.timeline.length < IncidentHistoryLimits.timelineEntriesBeforeClose;
