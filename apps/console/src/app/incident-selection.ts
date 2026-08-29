import type { ProjectId } from "@groundtruth/domain";
import { useEffect, useState } from "react";

export interface IncidentSelectionInput {
  readonly openIncidentId: string | null;
  readonly projectId: ProjectId | null;
  readonly routeIncidentId: string | null;
}

export interface RememberedIncident {
  readonly incidentId: string;
  readonly projectId: ProjectId;
}

export const rememberObservedIncident = (
  remembered: RememberedIncident | null,
  input: Pick<IncidentSelectionInput, "openIncidentId" | "projectId">,
) => {
  if (input.projectId === null) return null;
  if (input.openIncidentId !== null) {
    return { incidentId: input.openIncidentId, projectId: input.projectId };
  }
  return remembered?.projectId === input.projectId ? remembered : null;
};

export const selectVisibleIncidentId = (
  remembered: RememberedIncident | null,
  input: IncidentSelectionInput,
) =>
  input.routeIncidentId ??
  input.openIncidentId ??
  (remembered?.projectId === input.projectId ? remembered.incidentId : null);

export function useVisibleIncidentId(input: IncidentSelectionInput) {
  const [remembered, setRemembered] = useState<RememberedIncident | null>(null);
  const visibleIncidentId = selectVisibleIncidentId(remembered, input);

  useEffect(() => {
    setRemembered((current) =>
      rememberObservedIncident(current, {
        openIncidentId: input.openIncidentId,
        projectId: input.projectId,
      }),
    );
  }, [input.openIncidentId, input.projectId]);

  return visibleIncidentId;
}
