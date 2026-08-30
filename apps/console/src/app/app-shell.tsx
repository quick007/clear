import * as stylex from "@stylexjs/stylex";
import { Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppErrorBoundary } from "./app-error-boundary";
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
  return (
    <AppErrorBoundary>
      {location.pathname === "/" ? <Outlet /> : <WorkspaceShell />}
    </AppErrorBoundary>
  );
}

function WorkspaceShell() {
  const location = useLocation();
  const isIncidentDetail = /^\/incidents\/[^/]+$/.test(location.pathname);
  const runtime = useRuntimeQuery();
  const projectId = runtime.data?.projectId ?? null;
  const overview = useOverviewQuery(projectId);
  const overviewState =
    overview.isError && !overview.data ? "error" : overview.data ? "ready" : "loading";
  const routeIncidentId = location.pathname.match(/^\/incidents\/([^/]+)$/)?.[1] ?? null;
  const visibleIncidentId = useVisibleIncidentId({
    openIncidentId: overview.data?.openIncident?.id ?? null,
    projectId,
    routeIncidentId,
  });
  const incident = useIncidentQuery(projectId, visibleIncidentId);
  const session = useSessionQuery();
  const liveUpdateStatus = useLiveProjectUpdates(projectId);
  useEffect(() => {
    void startGroundtruthTools().catch((error: unknown) => {
      console.warn("Clear site tools could not start", error);
    });
    return stopGroundtruthTools;
  }, []);

  return (
    <div {...stylex.props(styles.app)}>
      <WorkspaceSidebar
        overview={overview.data}
        overviewState={overviewState}
        session={session.data}
      />
      <div {...stylex.props(styles.workspace)}>
        {liveUpdateStatus === "healthy" ? null : (
          <p aria-live="polite" role="status" {...stylex.props(styles.liveUpdateNotice)}>
            {liveUpdateStatus === "retrying"
              ? "Live updates paused. Retrying..."
              : "Live updates paused. Refresh to reconnect."}
          </p>
        )}
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
  workspace: {
    marginLeft: { default: 232, "@media (max-width: 840px)": 0 },
    minHeight: "100vh",
    minWidth: 0,
    position: "relative",
  },
  stage: { minHeight: "calc(100vh - 56px)", minWidth: 0 },
  liveUpdateNotice: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: 999,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 8px 30px rgba(0, 0, 0, 0.24)",
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 1.4,
    margin: 0,
    paddingBlock: 7,
    paddingInline: 12,
    position: "fixed",
    right: 16,
    top: 14,
    zIndex: 20,
    "@media (max-width: 840px)": { top: 58 },
  },
});
