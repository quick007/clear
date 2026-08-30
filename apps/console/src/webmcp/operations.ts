import {
  AddTimelineNoteRequest,
  CloseIncidentRequest,
  OpenIncidentRequest,
  SetHypothesisRequest,
} from "@groundtruth/api-contract";
import { LogSearch, MetricQuery, TraceSearch } from "@groundtruth/telemetry";
import { DateTime } from "effect";
import type { BrowserApiClient } from "../api/client";
import type { ToolSessionSource } from "../api/session-source";
import type {
  AddTimelineNoteInput,
  AnnotatePanelInput,
  CloseIncidentInput,
  CreateAlertRuleInput,
  CreatePanelInput,
  GetBoardStateInput,
  GetTraceInput,
  ListAlertsInput,
  ListDeployEventsInput,
  OpenIncidentInput,
  QueryMetricsInput,
  RemoveAlertRuleInput,
  RemovePanelInput,
  SampleLogsInput,
  SearchLogsInput,
  SearchTracesInput,
  SetHypothesisInput,
  UpdatePanelInput,
} from "./schemas";

const relativeRange = (window: QueryMetricsInput["window"]) =>
  ({ _tag: "relative", window }) as const;

export const makeLogSearch = (input: SearchLogsInput) =>
  new LogSearch({
    services: input.services,
    severities: input.severities,
    query: input.query,
    traceId: input.traceId,
    range: input.window === undefined ? undefined : relativeRange(input.window),
    filters: input.filters,
    limit: input.limit ?? 30,
    cursor: input.cursor,
  });

export const makeTraceSearch = (input: SearchTracesInput) =>
  new TraceSearch({
    services: input.services,
    operation: input.operation,
    status: input.status,
    minimumDurationMs: input.minimumDurationMs,
    maximumDurationMs: input.maximumDurationMs,
    range: input.window === undefined ? undefined : relativeRange(input.window),
    filters: input.filters,
    limit: input.limit ?? 30,
    cursor: input.cursor,
  });

export const makeToolOperations = (api: BrowserApiClient, sessions: ToolSessionSource) => {
  const projectId = () => sessions.getSnapshot().projectId;
  const incidentId = () => {
    const incident = sessions.getSnapshot().incident;
    if (incident === null) throw new Error("No incident is currently open");
    return incident.id;
  };

  return {
    getOverview: (signal?: AbortSignal) =>
      api.run(api.client.overview.getOverview({ params: { projectId: projectId() } }), signal),
    listAlerts: (input: ListAlertsInput, signal?: AbortSignal) =>
      api.run(
        api.client.overview.listAlerts({ params: { projectId: projectId() }, query: input }),
        signal,
      ),
    createAlertRule: (input: CreateAlertRuleInput, signal?: AbortSignal) =>
      api.run(
        api.client.alerts.createAlert({
          params: { projectId: projectId() },
          payload: { ...input, enabled: input.enabled ?? true },
        }),
        signal,
      ),
    removeAlertRule: (input: RemoveAlertRuleInput, signal?: AbortSignal) =>
      api.run(
        api.client.alerts.deleteAlert({
          params: { projectId: projectId(), alertId: input.alertId },
        }),
        signal,
      ),
    listServices: (signal?: AbortSignal) =>
      api.run(api.client.overview.listServices({ params: { projectId: projectId() } }), signal),
    listMetrics: (signal?: AbortSignal) =>
      api.run(api.client.telemetry.listMetrics({ params: { projectId: projectId() } }), signal),
    queryMetrics: (input: QueryMetricsInput, signal?: AbortSignal) =>
      api.run(
        api.client.telemetry.queryMetrics({
          params: { projectId: projectId() },
          payload: new MetricQuery({
            metric: input.metric,
            aggregation: input.aggregation,
            distinctKey: input.distinctKey,
            range: relativeRange(input.window),
            step: input.step,
            filters: input.filters,
            groupBy: input.groupBy,
            maxSeries: input.maxSeries ?? 12,
            maxPoints: input.maxPoints ?? 120,
          }),
        }),
        signal,
      ),
    searchLogs: (input: SearchLogsInput, signal?: AbortSignal) =>
      api.run(
        api.client.telemetry.searchLogs({
          params: { projectId: projectId() },
          payload: makeLogSearch(input),
        }),
        signal,
      ),
    sampleLogs: (input: SampleLogsInput, signal?: AbortSignal) =>
      api.run(
        api.client.telemetry.sampleLogs({
          params: { projectId: projectId() },
          query: input,
        }),
        signal,
      ),
    searchTraces: (input: SearchTracesInput, signal?: AbortSignal) =>
      api.run(
        api.client.telemetry.searchTraces({
          params: { projectId: projectId() },
          payload: makeTraceSearch(input),
        }),
        signal,
      ),
    getTrace: (input: GetTraceInput, signal?: AbortSignal) =>
      api.run(
        api.client.telemetry.getTrace({
          params: { projectId: projectId(), traceId: input.traceId },
        }),
        signal,
      ),
    listDeployEvents: (input: ListDeployEventsInput, signal?: AbortSignal) =>
      api.run(
        api.client.deploys.listDeployEvents({
          params: { projectId: projectId() },
          query: { ...input, limit: input.limit ?? 30 },
        }),
        signal,
      ),
    getBoardState: (input: GetBoardStateInput, signal?: AbortSignal) =>
      api.run(
        api.client.board.getBoard({
          params: { projectId: projectId() },
          query: input,
        }),
        signal,
      ),
    createPanel: (input: CreatePanelInput, signal?: AbortSignal) =>
      api.run(
        api.client.board.createPanel({
          params: { projectId: projectId() },
          payload: input,
        }),
        signal,
      ),
    updatePanel: (input: UpdatePanelInput, signal?: AbortSignal) =>
      api.run(
        api.client.board.updatePanel({
          params: { projectId: projectId(), panelId: input.panelId },
          payload: {
            spec: input.spec,
            position: input.position,
            expectedRevision: input.expectedRevision,
          },
        }),
        signal,
      ),
    removePanel: (input: RemovePanelInput, signal?: AbortSignal) =>
      api.run(
        api.client.board.removePanel({
          params: { projectId: projectId(), panelId: input.panelId },
        }),
        signal,
      ),
    annotatePanel: (input: AnnotatePanelInput, signal?: AbortSignal) =>
      api.run(
        api.client.board.annotatePanel({
          params: { projectId: projectId(), panelId: input.panelId },
          payload: { at: input.at ?? DateTime.nowUnsafe(), label: input.label },
        }),
        signal,
      ),
    openIncident: (input: OpenIncidentInput, signal?: AbortSignal) =>
      api.run(
        api.client.incidents.openIncident({
          params: { projectId: projectId() },
          payload: new OpenIncidentRequest(input),
        }),
        signal,
      ),
    addTimelineNote: (input: AddTimelineNoteInput, signal?: AbortSignal) =>
      api.run(
        api.client.incidents.addTimelineNote({
          params: { projectId: projectId(), incidentId: incidentId() },
          payload: new AddTimelineNoteRequest(input),
        }),
        signal,
      ),
    setHypothesis: (input: SetHypothesisInput, signal?: AbortSignal) =>
      api.run(
        api.client.incidents.setHypothesis({
          params: { projectId: projectId(), incidentId: incidentId() },
          payload: new SetHypothesisRequest(input),
        }),
        signal,
      ),
    closeIncident: (input: CloseIncidentInput, signal?: AbortSignal) => {
      return api.run(
        api.client.incidents.closeIncident({
          params: { projectId: projectId(), incidentId: incidentId() },
          payload: new CloseIncidentRequest(input),
        }),
        signal,
      );
    },
    refreshSession: () => sessions.refresh(),
    triggerSandboxIncident: async (signal?: AbortSignal) => {
      const result = await api.run(api.client.sandbox.triggerIncident({}), signal);
      await sessions.refresh(signal);
      return result;
    },
    resetSandbox: async (signal?: AbortSignal) => {
      const result = await api.run(api.client.sandbox.reset({}), signal);
      await sessions.refresh(signal);
      return result;
    },
  };
};

export type GroundtruthToolOperations = ReturnType<typeof makeToolOperations>;
