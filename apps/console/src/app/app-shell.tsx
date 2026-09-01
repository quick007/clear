import * as stylex from "@stylexjs/stylex";
import { Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppErrorBoundary } from "./app-error-boundary";
import { colors } from "../theme/tokens.stylex";
import { useLiveProjectUpdates } from "../data/live";
import { useTelemetryRefresh } from "../data/telemetry-refresh";
import {
  useIncidentQuery,
  useOverviewQuery,
  useRuntimeQuery,
  useSessionQuery,
} from "../data/queries";
import { IncidentContextNotice } from "./incident-context-notice";
import { useVisibleIncidentId } from "./incident-selection";
import { MobileWorkspaceHeader, WorkspaceSidebar } from "./sidebar";
import { SituationStrip } from "./situation-strip";
import { TimelineBar } from "./timeline-bar";
import { startGroundtruthTools, stopGroundtruthTools } from "../webmcp/bootstrap";
import { signInHref } from "../auth-route";
import {
  useWorkspaceAuthenticationRequired,
  WorkspaceFailureProvider,
} from "./workspace-failure-context";
import { isPublicRoute } from "./public-routes";

export function AppShell() {
  const location = useLocation();
  return (
    <AppErrorBoundary>
      {isPublicRoute(location.pathname) ? <Outlet /> : <WorkspaceShell />}
    </AppErrorBoundary>
  );
}

function WorkspaceShell() {
  return (
    <WorkspaceFailureProvider>
      <WorkspaceShellContent />
    </WorkspaceFailureProvider>
  );
}

function WorkspaceShellContent() {
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
  const incidentContextError = visibleIncidentId === null ? null : incident.error;
  const session = useSessionQuery();
  const liveUpdateStatus = useLiveProjectUpdates(projectId);
  const authenticationRequired = useWorkspaceAuthenticationRequired();
  useTelemetryRefresh(projectId, runtime.data?.mode ?? null, liveUpdateStatus);
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
        {authenticationRequired ? (
          <div aria-live="polite" role="status" {...stylex.props(styles.authenticationNotice)}>
            <span>Your session ended. Showing the last loaded data.</span>
            <a href={signInHref(location.pathname)} {...stylex.props(styles.authenticationAction)}>
              Log in again
            </a>
          </div>
        ) : null}
        <MobileWorkspaceHeader
          overview={overview.data}
          overviewState={overviewState}
          session={session.data}
        />
        {isIncidentDetail ? null : (
          <>
            <SituationStrip incidentDetail={incident.data} overview={overview.data} />
            <IncidentContextNotice
              error={authenticationRequired ? null : incidentContextError}
              hasDetail={incident.data !== undefined}
              onRetry={() => void incident.refetch()}
              retrying={incident.isFetching}
              returnPath={location.pathname}
            />
          </>
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
    marginLeft: { default: 224, "@media (max-width: 840px)": 0 },
    minHeight: "100vh",
    minWidth: 0,
    position: "relative",
  },
  stage: { minHeight: "calc(100vh - 56px)", minWidth: 0 },
  authenticationNotice: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: colors.textMuted,
    display: "flex",
    fontSize: 12,
    gap: 16,
    justifyContent: "space-between",
    lineHeight: 1.45,
    minHeight: 42,
    paddingBlock: 8,
    paddingInline: { default: 24, "@media (max-width: 620px)": 20 },
  },
  authenticationAction: {
    color: colors.text,
    flexShrink: 0,
    fontWeight: 500,
    textDecoration: "none",
    ":hover": { textDecoration: "underline" },
  },
});
