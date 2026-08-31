import type { ProjectId } from "@groundtruth/domain";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { SessionMode } from "../api/session-source";

const sandboxRefreshMilliseconds = 5 * 1_000; // 5 seconds
const hostedRefreshMilliseconds = 15 * 1_000; // 15 seconds
const maximumFastRefreshQueries = 12;

export const liveTelemetryRefreshMilliseconds = (activeQueryCount: number) =>
  activeQueryCount <= maximumFastRefreshQueries
    ? sandboxRefreshMilliseconds
    : hostedRefreshMilliseconds;

export const isTelemetryQueryKey = (queryKey: ReadonlyArray<unknown>, projectId: ProjectId) => {
  if (queryKey[0] !== "groundtruth" || queryKey[1] !== String(projectId)) return false;
  const scope = queryKey[2];
  return (
    scope === "overview" ||
    scope === "panels" ||
    scope === "logs" ||
    scope === "traces" ||
    scope === "alerts" ||
    (scope === "metrics" && queryKey[3] === "explore")
  );
};

export const invalidateTelemetryQueries = (
  queryClient: QueryClient,
  projectId: ProjectId,
  throwOnError = false,
) =>
  queryClient.invalidateQueries(
    {
      predicate: (query) => isTelemetryQueryKey(query.queryKey, projectId),
      refetchType: "active",
    },
    { cancelRefetch: false, throwOnError },
  );

export const activeTelemetryQueryCount = (queryClient: QueryClient, projectId: ProjectId) =>
  queryClient.getQueryCache().findAll({
    type: "active",
    predicate: (query) => isTelemetryQueryKey(query.queryKey, projectId),
  }).length;

export function useTelemetryRefresh(
  projectId: ProjectId | null,
  mode: SessionMode | null,
  liveUpdateStatus: "healthy" | "paused" | "retrying",
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (projectId === null || mode === null || liveUpdateStatus === "healthy") {
      return;
    }
    const interval = window.setInterval(
      () => {
        if (document.visibilityState === "hidden") return;
        void invalidateTelemetryQueries(queryClient, projectId);
      },
      mode === "sandbox" ? sandboxRefreshMilliseconds : hostedRefreshMilliseconds,
    );
    return () => window.clearInterval(interval);
  }, [liveUpdateStatus, mode, projectId, queryClient]);
}
