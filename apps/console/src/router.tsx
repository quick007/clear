import type { TelemetryWindow } from "@groundtruth/telemetry";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
} from "@tanstack/react-router";

import { AppShell } from "./app/app-shell";

const exploreWindow = (value: unknown): TelemetryWindow => {
  if (value === "15m" || value === "6h" || value === "24h" || value === "7d") return value;
  return "1h";
};

const BoardPage = lazyRouteComponent(() => import("./features/board/board-page"), "BoardPage");
const ExplorePage = lazyRouteComponent(
  () => import("./features/explore/explore-page"),
  "ExplorePage",
);
const HomePage = lazyRouteComponent(() => import("./features/home/home-page"), "HomePage");
const IncidentsPage = lazyRouteComponent(
  () => import("./features/incidents/incidents-page"),
  "IncidentsPage",
);
const IncidentDetailPage = lazyRouteComponent(
  () => import("./features/incidents/incident-detail-page"),
  "IncidentDetailPage",
);
const TraceDetailPage = lazyRouteComponent(
  () => import("./features/traces/trace-detail-page"),
  "TraceDetailPage",
);
const AlertsPage = lazyRouteComponent(() => import("./features/alerts/alerts-page"), "AlertsPage");
const DeploysPage = lazyRouteComponent(
  () => import("./features/deploys/deploys-page"),
  "DeploysPage",
);
const ConnectPage = lazyRouteComponent(
  () => import("./features/connect/connect-page"),
  "ConnectPage",
);
const ProjectSettingsPage = lazyRouteComponent(
  () => import("./features/settings/project-settings-page"),
  "ProjectSettingsPage",
);

const rootRoute = createRootRoute({ component: AppShell });

const indexRoute = createRoute({
  component: HomePage,
  getParentRoute: () => rootRoute,
  path: "/",
});

const boardRoute = createRoute({
  component: BoardPage,
  getParentRoute: () => rootRoute,
  path: "/board",
  validateSearch: (search: Record<string, unknown>) => ({
    start: search.start === true || search.start === "true" ? true : undefined,
  }),
});

const exploreRoute = createRoute({
  component: ExplorePage,
  getParentRoute: () => rootRoute,
  path: "/explore",
  validateSearch: (search: Record<string, unknown>) => ({
    metric: typeof search.metric === "string" ? search.metric.slice(0, 256) : undefined,
    service: typeof search.service === "string" ? search.service.slice(0, 255) : undefined,
    signal:
      search.signal === "logs" || search.signal === "traces" ? search.signal : ("metrics" as const),
    window: exploreWindow(search.window),
  }),
});

const logsRoute = createRoute({
  component: () => (
    <Navigate
      replace
      search={{ metric: undefined, service: undefined, signal: "logs" as const, window: "1h" }}
      to="/explore"
    />
  ),
  getParentRoute: () => rootRoute,
  path: "/logs",
});

const tracesRoute = createRoute({
  component: () => (
    <Navigate
      replace
      search={{ metric: undefined, service: undefined, signal: "traces" as const, window: "1h" }}
      to="/explore"
    />
  ),
  getParentRoute: () => rootRoute,
  path: "/traces",
});

const traceDetailRoute = createRoute({
  component: TraceDetailPage,
  getParentRoute: () => rootRoute,
  path: "/traces/$traceId",
});

const alertsRoute = createRoute({
  component: AlertsPage,
  getParentRoute: () => rootRoute,
  path: "/alerts",
});

const deploysRoute = createRoute({
  component: DeploysPage,
  getParentRoute: () => rootRoute,
  path: "/deploys",
});

const connectRoute = createRoute({
  component: ConnectPage,
  getParentRoute: () => rootRoute,
  path: "/connect",
});

const settingsRoute = createRoute({
  component: ProjectSettingsPage,
  getParentRoute: () => rootRoute,
  path: "/settings/project",
});

const incidentRoute = createRoute({
  component: IncidentDetailPage,
  getParentRoute: () => rootRoute,
  path: "/incidents/$incidentId",
});

const incidentsRoute = createRoute({
  component: IncidentsPage,
  getParentRoute: () => rootRoute,
  path: "/incidents",
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  boardRoute,
  exploreRoute,
  logsRoute,
  tracesRoute,
  traceDetailRoute,
  alertsRoute,
  deploysRoute,
  connectRoute,
  settingsRoute,
  incidentsRoute,
  incidentRoute,
]);

export const router = createRouter({ defaultPreload: "intent", routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
