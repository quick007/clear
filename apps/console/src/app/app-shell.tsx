import * as stylex from "@stylexjs/stylex";
import { Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { colors } from "../theme/tokens.stylex";
import { useLiveProjectUpdates } from "../data/live";
import {
  useIncidentQuery,
  useOverviewQuery,
  useRuntimeQuery,
  useSessionQuery,
} from "../data/queries";
import { useVisibleIncidentId } from "./incident-selection";
import { MobileWorkspaceHeader, WorkspaceSidebar } from "./sidebar";
import { SituationStrip } from "./situation-strip";
import { TimelineBar } from "./timeline-bar";
import { startGroundtruthTools, stopGroundtruthTools } from "../webmcp/bootstrap";

export function AppShell() {
  const location = useLocation();
  if (location.pathname === "/") return <Outlet />;
  return <WorkspaceShell />;
}

function WorkspaceShell() {
  const location = useLocation();
  const isIncidentDetail = /^\/incidents\/[^/]+$/.test(location.pathname);
  const runtime = useRuntimeQuery();
  const projectId = runtime.data?.projectId ?? null;
  const overview = useOverviewQuery(projectId);
  const overviewState = overview.isError ? "error" : overview.data ? "ready" : "loading";
  const routeIncidentId = location.pathname.match(/^\/incidents\/([^/]+)$/)?.[1] ?? null;
  const visibleIncidentId = useVisibleIncidentId({
    openIncidentId: overview.data?.openIncident?.id ?? null,
    projectId,
    routeIncidentId,
  });
  const incident = useIncidentQuery(projectId, visibleIncidentId);
  const session = useSessionQuery();
  useLiveProjectUpdates(projectId);
  useEffect(() => {
    void startGroundtruthTools().catch((error: unknown) => {
      console.warn("Clear site tools could not start", error);
    });
    return stopGroundtruthTools;
  }, []);

  return (
    <div {...stylex.props(styles.app)}>
      <span aria-hidden {...stylex.props(styles.atmosphere)} />
      <WorkspaceSidebar
        overview={overview.data}
        overviewState={overviewState}
        session={session.data}
      />
      <div {...stylex.props(styles.workspace)}>
        <MobileWorkspaceHeader
          overview={overview.data}
          overviewState={overviewState}
          session={session.data}
        />
        {isIncidentDetail ? null : (
          <SituationStrip incidentDetail={incident.data} overview={overview.data} />
        )}
        <main {...stylex.props(styles.stage)}>
          <Outlet />
        </main>
        {isIncidentDetail ? null : (
          <TimelineBar incidentDetail={incident.data} overview={overview.data} />
        )}
      </div>
    </div>
  );
}

const styles = stylex.create({
  app: {
    backgroundColor: colors.canvas,
    color: colors.text,
    isolation: "isolate",
    minHeight: "100vh",
    position: "relative",
  },
  atmosphere: {
    backgroundImage:
      "radial-gradient(ellipse at 76% 118%, rgba(116, 201, 194, 0.11) 0%, rgba(80, 131, 142, 0.045) 34%, transparent 62%), radial-gradient(ellipse at 98% 108%, rgba(215, 161, 122, 0.055) 0%, transparent 42%)",
    bottom: 0,
    height: "72vh",
    left: 232,
    pointerEvents: "none",
    position: "fixed",
    right: 0,
    zIndex: -1,
    "@media (max-width: 840px)": { left: 0 },
  },
  workspace: {
    marginLeft: { default: 232, "@media (max-width: 840px)": 0 },
    minHeight: "100vh",
    minWidth: 0,
    position: "relative",
  },
  stage: { minHeight: "calc(100vh - 56px)", minWidth: 0 },
});
