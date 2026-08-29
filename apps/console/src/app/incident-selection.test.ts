import { ProjectId } from "@groundtruth/domain";
import { describe, expect, it } from "vite-plus/test";

import {
  rememberObservedIncident,
  selectVisibleIncidentId,
  type RememberedIncident,
} from "./incident-selection";

const firstProject = ProjectId.make("01890f6e-7c00-7000-8000-000000000001");
const secondProject = ProjectId.make("01890f6e-7c00-7000-8000-000000000002");

describe("incident selection", () => {
  it("keeps the observed incident selected when it closes", () => {
    const remembered = rememberObservedIncident(null, {
      openIncidentId: "incident-open",
      projectId: firstProject,
    });

    expect(
      selectVisibleIncidentId(remembered, {
        openIncidentId: null,
        projectId: firstProject,
        routeIncidentId: null,
      }),
    ).toBe("incident-open");
  });

  it("does not carry an incident into another project", () => {
    const remembered: RememberedIncident = {
      incidentId: "incident-first-project",
      projectId: firstProject,
    };

    expect(
      selectVisibleIncidentId(remembered, {
        openIncidentId: null,
        projectId: secondProject,
        routeIncidentId: null,
      }),
    ).toBeNull();
    expect(
      rememberObservedIncident(remembered, {
        openIncidentId: null,
        projectId: secondProject,
      }),
    ).toBeNull();
  });

  it("lets an explicit incident route override current and remembered incidents", () => {
    const remembered: RememberedIncident = {
      incidentId: "incident-remembered",
      projectId: firstProject,
    };

    expect(
      selectVisibleIncidentId(remembered, {
        openIncidentId: "incident-open",
        projectId: firstProject,
        routeIncidentId: "incident-from-route",
      }),
    ).toBe("incident-from-route");
  });
});
