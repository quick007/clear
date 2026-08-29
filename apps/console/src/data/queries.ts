import {
  type CloseIncidentRequest,
  type CreateAlertRequest,
  type CreateManualAlertRequest,
  type CreatePanelRequest,
  type StartInvestigationRequest,
} from "@groundtruth/api-contract";
import { type AlertId, IncidentId, IngestKeyName, type ProjectId } from "@groundtruth/domain";
import { TraceId } from "@groundtruth/telemetry";
import {
  AttributeFilter,
  AttributeKey,
  LogSearch,
  MetricName,
  MetricQuery,
  RelativeTimeRange,
  ServiceName,
  type TelemetryWindow,
  TraceSearch,
  type MetricAggregation,
} from "@groundtruth/telemetry";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Effect } from "effect";

import { getConsoleRuntime } from "../api/runtime";
import { queryKeys } from "./query-keys";

const run = async <A, E>(
  operation: (runtime: Awaited<ReturnType<typeof getConsoleRuntime>>) => Effect.Effect<A, E>,
  signal?: AbortSignal,
) => {
  const runtime = await getConsoleRuntime();
  return runtime.api.run(operation(runtime), signal) as Promise<A>;
};

export function useRuntimeQuery() {
  return useQuery({
    queryKey: queryKeys.runtime,
    queryFn: async () => {
      const runtime = await getConsoleRuntime();
      return runtime.sessions.getSnapshot();
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useSessionQuery() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) => run((runtime) => runtime.api.client.auth.getSession({}), signal),
  });
}

export function useOverviewQuery(projectId: ProjectId | null) {
  return useQuery({
    queryKey:
      projectId === null ? ["groundtruth", "overview", "idle"] : queryKeys.overview(projectId),
    queryFn: ({ signal }) =>
      run(
        (runtime) => runtime.api.client.overview.getOverview({ params: { projectId: projectId! } }),
        signal,
      ),
    enabled: projectId !== null,
  });
}

export function useBoardQuery(projectId: ProjectId | null) {
  return useQuery({
    queryKey: projectId === null ? ["groundtruth", "board", "idle"] : queryKeys.board(projectId),
    queryFn: ({ signal }) =>
      run(
        (runtime) =>
          runtime.api.client.board.getBoard({ params: { projectId: projectId! }, query: {} }),
        signal,
      ),
    enabled: projectId !== null,
  });
}

export function useCreatePanel(projectId: ProjectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePanelRequest) =>
      run((runtime) => runtime.api.client.board.createPanel({ params: { projectId }, payload })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) }),
  });
}

export function useMetricCatalogQuery(projectId: ProjectId | null) {
  return useQuery({
    queryKey:
      projectId === null ? ["groundtruth", "metrics", "idle"] : queryKeys.metricCatalog(projectId),
    queryFn: ({ signal }) =>
      run(
        (runtime) =>
          runtime.api.client.telemetry.listMetrics({ params: { projectId: projectId! } }),
        signal,
      ),
    enabled: projectId !== null,
  });
}

export function useMetricExploreQuery(
  projectId: ProjectId | null,
  metric: string | null,
  aggregation: MetricAggregation,
  window: TelemetryWindow,
  service?: string,
) {
  return useQuery({
    queryKey:
      projectId === null || metric === null
        ? ["groundtruth", "metrics", "explore", "idle"]
        : queryKeys.metricExplore(projectId, metric, aggregation, window, service),
    queryFn: ({ signal }) =>
      run(
        (runtime) =>
          runtime.api.client.telemetry.queryMetrics({
            params: { projectId: projectId! },
            payload: MetricQuery.make({
              aggregation,
              filters: service ? [serviceFilter(service)] : undefined,
              maxPoints: 240,
              maxSeries: 8,
              metric: MetricName.make(metric!),
              range: RelativeTimeRange.make({ window }),
            }),
          }),
        signal,
      ),
    enabled: projectId !== null && metric !== null,
  });
}

export function useLogsQuery(
  projectId: ProjectId | null,
  search: string,
  window: TelemetryWindow,
  service?: string,
) {
  return useQuery({
    queryKey:
      projectId === null
        ? ["groundtruth", "logs", "idle"]
        : queryKeys.logs(projectId, search, window, service),
    queryFn: ({ signal }) =>
      run(
        (runtime) =>
          runtime.api.client.telemetry.searchLogs({
            params: { projectId: projectId! },
            payload: LogSearch.make({
              query: search.length > 0 ? search : undefined,
              services: service ? [ServiceName.make(service)] : undefined,
              range: RelativeTimeRange.make({ window }),
              limit: 50,
            }),
          }),
        signal,
      ),
    enabled: projectId !== null,
  });
}

export function useTracesQuery(
  projectId: ProjectId | null,
  search: string,
  window: TelemetryWindow,
  service?: string,
) {
  return useQuery({
    queryKey:
      projectId === null
        ? ["groundtruth", "traces", "idle"]
        : queryKeys.traces(projectId, search, window, service),
    queryFn: ({ signal }) =>
      run(
        (runtime) =>
          runtime.api.client.telemetry.searchTraces({
            params: { projectId: projectId! },
            payload: TraceSearch.make({
              operation: search.length > 0 ? search : undefined,
              services: service ? [ServiceName.make(service)] : undefined,
              range: RelativeTimeRange.make({ window }),
              limit: 50,
            }),
          }),
        signal,
      ),
    enabled: projectId !== null,
  });
}

const serviceFilter = (service: string) =>
  AttributeFilter.make({
    key: AttributeKey.make("service.name"),
    operator: "equals",
    value: service,
  });

export function useTraceQuery(projectId: ProjectId | null, traceId: string) {
  const isTraceId = /^(?!0{32}$)[0-9a-f]{32}$/.test(traceId);
  return useQuery({
    queryKey:
      projectId === null ? ["groundtruth", "trace", "idle"] : queryKeys.trace(projectId, traceId),
    queryFn: ({ signal }) =>
      run(
        (runtime) =>
          runtime.api.client.telemetry.getTrace({
            params: { projectId: projectId!, traceId: TraceId.make(traceId) },
          }),
        signal,
      ),
    enabled: projectId !== null && isTraceId,
  });
}

export function useAlertsQuery(projectId: ProjectId | null) {
  return useQuery({
    queryKey: projectId === null ? ["groundtruth", "alerts", "idle"] : queryKeys.alerts(projectId),
    queryFn: ({ signal }) =>
      run(
        (runtime) =>
          runtime.api.client.overview.listAlerts({ params: { projectId: projectId! }, query: {} }),
        signal,
      ),
    enabled: projectId !== null,
  });
}

export function useManualAlertsQuery(projectId: ProjectId | null) {
  return useQuery({
    queryKey:
      projectId === null
        ? ["groundtruth", "manual-alerts", "idle"]
        : queryKeys.manualAlerts(projectId),
    queryFn: ({ signal }) =>
      run(
        (runtime) =>
          runtime.api.client.alerts.listManualAlerts({ params: { projectId: projectId! } }),
        signal,
      ),
    enabled: projectId !== null,
  });
}

export function useIncidentsQuery(projectId: ProjectId | null) {
  return useQuery({
    queryKey:
      projectId === null ? ["groundtruth", "incidents", "idle"] : queryKeys.incidents(projectId),
    queryFn: ({ signal }) =>
      run(
        (runtime) =>
          runtime.api.client.incidents.listIncidents({ params: { projectId: projectId! } }),
        signal,
      ),
    enabled: projectId !== null,
  });
}

const invalidateAlertState = (
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: ProjectId,
) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.alerts(projectId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.overview(projectId) }),
  ]);

export function useCreateAlertRule(projectId: ProjectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAlertRequest) =>
      run((runtime) => runtime.api.client.alerts.createAlert({ params: { projectId }, payload })),
    onSuccess: () => invalidateAlertState(queryClient, projectId),
  });
}

export function useCreateManualAlert(projectId: ProjectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateManualAlertRequest) =>
      run((runtime) =>
        runtime.api.client.alerts.createManualAlert({ params: { projectId }, payload }),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.manualAlerts(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview(projectId) }),
      ]),
  });
}

export function useStartInvestigation(projectId: ProjectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, payload }: { alertId: AlertId; payload: StartInvestigationRequest }) =>
      run((runtime) =>
        runtime.api.client.alerts.startInvestigation({
          params: { projectId, alertId },
          payload,
        }),
      ),
    onSuccess: async () => {
      const consoleRuntime = await getConsoleRuntime();
      await consoleRuntime.sessions.refresh();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview(projectId) }),
      ]);
    },
  });
}

export function useCloseIncident(projectId: ProjectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      incidentId,
      payload,
    }: {
      incidentId: ReturnType<typeof IncidentId.make>;
      payload: CloseIncidentRequest;
    }) =>
      run((runtime) =>
        runtime.api.client.incidents.closeIncident({
          params: { projectId, incidentId },
          payload,
        }),
      ),
    onSuccess: async (_result, input) => {
      const consoleRuntime = await getConsoleRuntime();
      await consoleRuntime.sessions.refresh();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.incidents(projectId) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.incident(projectId, input.incidentId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview(projectId) }),
      ]);
    },
  });
}

export function useDeleteAlertRule(projectId: ProjectId | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: AlertId) => {
      if (projectId === null) throw new Error("No active project is available");
      return run((runtime) =>
        runtime.api.client.alerts.deleteAlert({ params: { projectId, alertId } }),
      );
    },
    onSuccess: () =>
      projectId === null ? Promise.resolve() : invalidateAlertState(queryClient, projectId),
  });
}

export function useIncidentQuery(projectId: ProjectId | null, incidentId: string | null) {
  return useQuery({
    queryKey:
      projectId === null || incidentId === null
        ? ["groundtruth", "incident", "idle"]
        : queryKeys.incident(projectId, incidentId),
    queryFn: ({ signal }) =>
      run(
        (runtime) =>
          runtime.api.client.incidents.getIncident({
            params: { projectId: projectId!, incidentId: IncidentId.make(incidentId!) },
          }),
        signal,
      ),
    enabled: projectId !== null && incidentId !== null,
  });
}

export function useDeploysQuery(projectId: ProjectId | null) {
  return useQuery({
    queryKey:
      projectId === null ? ["groundtruth", "deploys", "idle"] : queryKeys.deploys(projectId),
    queryFn: ({ signal }) =>
      run(
        (runtime) =>
          runtime.api.client.deploys.listDeployEvents({
            params: { projectId: projectId! },
            query: { limit: 50 },
          }),
        signal,
      ),
    enabled: projectId !== null,
  });
}

export function useIngestKeysQuery(projectId: ProjectId | null) {
  return useQuery({
    queryKey:
      projectId === null ? ["groundtruth", "ingest-keys", "idle"] : queryKeys.ingestKeys(projectId),
    queryFn: ({ signal }) =>
      run(
        (runtime) =>
          runtime.api.client.ingestKeys.listIngestKeys({ params: { projectId: projectId! } }),
        signal,
      ),
    enabled: projectId !== null,
  });
}

export function useCreateIngestKey(projectId: ProjectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      run((runtime) =>
        runtime.api.client.ingestKeys.createIngestKey({
          params: { projectId },
          payload: { name: IngestKeyName.make(name) },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ingestKeys(projectId) }),
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => run((runtime) => runtime.api.client.auth.logout({})),
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/");
    },
  });
}

export function useRevokeIngestKey(projectId: ProjectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      ingestKeyId: Parameters<
        Awaited<
          ReturnType<typeof getConsoleRuntime>
        >["api"]["client"]["ingestKeys"]["revokeIngestKey"]
      >[0]["params"]["ingestKeyId"],
    ) =>
      run((runtime) =>
        runtime.api.client.ingestKeys.revokeIngestKey({ params: { projectId, ingestKeyId } }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ingestKeys(projectId) }),
  });
}

export function useTriggerSandboxIncident(projectId: ProjectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => run((runtime) => runtime.api.client.sandbox.triggerIncident({})),
    onSuccess: async () => {
      const consoleRuntime = await getConsoleRuntime();
      await consoleRuntime.sessions.refresh();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.runtime }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.board(projectId) }),
      ]);
    },
  });
}

export { run as runGroundtruthQuery };
