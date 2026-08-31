import type { IncidentDetail } from "@groundtruth/api-contract";
import type { Incident, IncidentId, ProjectId } from "@groundtruth/domain";
import { DateTime } from "effect";
import { emptyProjectIncidentState, type IncidentStateMap } from "./IncidentState.js";

export interface AlertFilter {
  readonly status?: string | undefined;
  readonly severity?: string | undefined;
  readonly service?: string | undefined;
}

export const listProjectAlerts = (
  all: IncidentStateMap,
  projectId: ProjectId,
  filter: AlertFilter,
) => {
  const project = all.get(projectId) ?? emptyProjectIncidentState;
  return project.alerts.filter(
    (alert) =>
      (filter.status === undefined || alert.status === filter.status) &&
      (filter.severity === undefined || alert.severity === filter.severity) &&
      (filter.service === undefined || alert.serviceName === filter.service),
  );
};

export const getProjectOpenIncident = (all: IncidentStateMap, projectId: ProjectId) => {
  const detail = all.get(projectId)?.detail;
  return detail?.incident.status === "open" ? detail.incident : null;
};

export const listProjectIncidents = (
  all: IncidentStateMap,
  projectId: ProjectId,
): ReadonlyArray<Incident> => {
  const project = all.get(projectId);
  if (project === undefined) return [];
  return [...(project.detail === null ? [] : [project.detail]), ...project.history]
    .map((detail) => detail.incident)
    .sort(
      (left, right) =>
        DateTime.toEpochMillis(right.openedAt) - DateTime.toEpochMillis(left.openedAt),
    );
};

export const findProjectIncident = (
  all: IncidentStateMap,
  projectId: ProjectId,
  incidentId: IncidentId,
): IncidentDetail | undefined => {
  const project = all.get(projectId);
  return project?.detail?.incident.id === incidentId
    ? project.detail
    : project?.history.find((detail) => detail.incident.id === incidentId);
};
