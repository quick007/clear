import type { ProjectId } from "@groundtruth/domain";

export const queryKeys = {
  runtime: ["groundtruth", "runtime"] as const,
  session: ["groundtruth", "session"] as const,
  overview: (projectId: ProjectId) => ["groundtruth", String(projectId), "overview"] as const,
  board: (projectId: ProjectId) => ["groundtruth", String(projectId), "board"] as const,
  metricCatalog: (projectId: ProjectId) =>
    ["groundtruth", String(projectId), "metrics", "catalog"] as const,
  metricExplore: (
    projectId: ProjectId,
    metric: string,
    aggregation: string,
    window: string,
    service?: string,
  ) =>
    [
      "groundtruth",
      String(projectId),
      "metrics",
      "explore",
      metric,
      aggregation,
      window,
      service,
    ] as const,
  panel: (projectId: ProjectId, panelId: string, revision: number) =>
    ["groundtruth", String(projectId), "panels", panelId, revision] as const,
  logs: (projectId: ProjectId, search: string, window: string, service?: string) =>
    ["groundtruth", String(projectId), "logs", "search", search, window, service] as const,
  traces: (projectId: ProjectId, search: string, window: string, service?: string) =>
    ["groundtruth", String(projectId), "traces", "search", search, window, service] as const,
  trace: (projectId: ProjectId, traceId: string) =>
    ["groundtruth", String(projectId), "traces", traceId] as const,
  alerts: (projectId: ProjectId) => ["groundtruth", String(projectId), "alerts"] as const,
  manualAlerts: (projectId: ProjectId) =>
    ["groundtruth", String(projectId), "alerts", "manual"] as const,
  incidents: (projectId: ProjectId) => ["groundtruth", String(projectId), "incidents"] as const,
  deploys: (projectId: ProjectId, service?: string, window?: string) =>
    ["groundtruth", String(projectId), "deploys", "list", service, window] as const,
  ingestKeys: (projectId: ProjectId) => ["groundtruth", String(projectId), "ingest-keys"] as const,
  incident: (projectId: ProjectId, incidentId: string) =>
    ["groundtruth", String(projectId), "incidents", incidentId] as const,
};
