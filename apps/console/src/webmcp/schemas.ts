import { Cursor as ApiCursor } from "@groundtruth/api-contract";
import {
  AlertId,
  AlertName,
  AlertSeverity,
  DashboardId,
  HypothesisId,
  HypothesisStatus,
  IncidentTitle,
  PanelId,
  ServiceName as DomainServiceName,
} from "@groundtruth/domain";
import { PanelSpec } from "@groundtruth/panel-dsl";
import {
  AttributeFilter,
  AttributeKey,
  Cursor,
  LogSeverity,
  MetricAggregation,
  MetricName,
  QueryStep,
  ServiceName,
  SpanStatusCode,
  TelemetryWindow,
  TraceId,
} from "@groundtruth/telemetry";
import { Schema } from "effect";

const described = <S extends Schema.Top>(schema: S, description: string) =>
  schema.annotate({ description });

export const NoInput = Schema.Record(Schema.String, Schema.Never);

export const ListAlertsInput = Schema.Struct({
  status: Schema.optionalKey(Schema.Literals(["healthy", "firing", "resolved"])),
  severity: Schema.optionalKey(Schema.Literals(["info", "warning", "critical"])),
  service: Schema.optionalKey(described(DomainServiceName, "Restrict alerts to one service.")),
  window: Schema.optionalKey(TelemetryWindow),
});

export const CreateAlertRuleInput = Schema.Struct({
  name: described(AlertName, "Short rule name visible on the shared alerts page."),
  serviceName: described(DomainServiceName, "Observed service to evaluate."),
  metricName: described(
    Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 255)),
    "Metric name returned by list_metrics.",
  ),
  aggregation: described(
    Schema.Literals(["sum", "avg", "min", "max", "count", "rate", "p50", "p95", "p99"]),
    "Aggregation evaluated over the selected window.",
  ),
  comparison: Schema.Literals(["above", "at-or-above", "below", "at-or-below"]),
  threshold: Schema.Finite,
  windowSeconds: Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 86_400 })),
  severity: AlertSeverity,
  enabled: Schema.optionalKey(Schema.Boolean),
});

export const RemoveAlertRuleInput = Schema.Struct({ alertId: AlertId });

export const QueryMetricsInput = Schema.Struct({
  metric: described(MetricName, "OpenTelemetry metric name."),
  aggregation: MetricAggregation,
  distinctKey: Schema.optionalKey(
    described(AttributeKey, "Attribute to count when aggregation is count-distinct."),
  ),
  window: described(TelemetryWindow, "Relative time window to query."),
  step: Schema.optionalKey(QueryStep),
  filters: Schema.optionalKey(Schema.Array(AttributeFilter).check(Schema.isMaxLength(16))),
  groupBy: Schema.optionalKey(
    Schema.Array(AttributeKey).check(Schema.isMaxLength(2), Schema.isUnique()),
  ),
  maxSeries: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16 }))),
  maxPoints: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 240 }))),
});

export const SearchLogsInput = Schema.Struct({
  services: Schema.optionalKey(Schema.Array(ServiceName).check(Schema.isMaxLength(10))),
  severities: Schema.optionalKey(Schema.Array(LogSeverity).check(Schema.isUnique())),
  query: Schema.optionalKey(
    described(
      Schema.String.check(Schema.isMaxLength(1_000)),
      "Text to find in log bodies and attributes.",
    ),
  ),
  traceId: Schema.optionalKey(TraceId),
  window: Schema.optionalKey(TelemetryWindow),
  filters: Schema.optionalKey(Schema.Array(AttributeFilter).check(Schema.isMaxLength(16))),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }))),
  cursor: Schema.optionalKey(Cursor),
});

export const SampleLogsInput = Schema.Struct({
  service: ServiceName,
  severity: Schema.optionalKey(LogSeverity),
  window: Schema.optionalKey(TelemetryWindow),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }))),
});

export const SearchTracesInput = Schema.Struct({
  services: Schema.optionalKey(Schema.Array(ServiceName).check(Schema.isMaxLength(10))),
  operation: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(1_000))),
  status: Schema.optionalKey(SpanStatusCode),
  minimumDurationMs: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  maximumDurationMs: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  window: Schema.optionalKey(TelemetryWindow),
  filters: Schema.optionalKey(Schema.Array(AttributeFilter).check(Schema.isMaxLength(16))),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }))),
  cursor: Schema.optionalKey(Cursor),
});

export const GetTraceInput = Schema.Struct({ traceId: TraceId });

export const ListDeployEventsInput = Schema.Struct({
  service: Schema.optionalKey(DomainServiceName),
  window: Schema.optionalKey(TelemetryWindow),
  cursor: Schema.optionalKey(ApiCursor),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }))),
});

export const GetBoardStateInput = Schema.Struct({
  dashboardId: Schema.optionalKey(DashboardId),
});

export const CreatePanelInput = Schema.Struct({
  dashboardId: DashboardId,
  spec: PanelSpec,
  position: Schema.optionalKey(Schema.Natural),
});

export const UpdatePanelInput = Schema.Struct({
  panelId: PanelId,
  spec: PanelSpec,
  position: Schema.optionalKey(Schema.Natural),
  expectedRevision: Schema.Natural,
});

export const RemovePanelInput = Schema.Struct({ panelId: PanelId });

export const AnnotatePanelInput = Schema.Struct({
  panelId: PanelId,
  at: Schema.optionalKey(Schema.DateTimeUtcFromString),
  label: described(
    Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 500)),
    "Short note shown on the panel timeline.",
  ),
});

export const AddTimelineNoteInput = Schema.Struct({
  text: Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 10_000)),
});

export const OpenIncidentInput = Schema.Struct({
  title: described(IncidentTitle, "Concise incident title visible on the shared board."),
});

export const SetHypothesisInput = Schema.Struct({
  hypothesisId: Schema.optionalKey(HypothesisId),
  text: Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 10_000)),
  status: HypothesisStatus,
});

export const CloseIncidentInput = Schema.Struct({
  summary: Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 10_000)),
});

export type QueryMetricsInput = typeof QueryMetricsInput.Type;
export type ListAlertsInput = typeof ListAlertsInput.Type;
export type CreateAlertRuleInput = typeof CreateAlertRuleInput.Type;
export type RemoveAlertRuleInput = typeof RemoveAlertRuleInput.Type;
export type SearchLogsInput = typeof SearchLogsInput.Type;
export type SampleLogsInput = typeof SampleLogsInput.Type;
export type SearchTracesInput = typeof SearchTracesInput.Type;
export type GetTraceInput = typeof GetTraceInput.Type;
export type ListDeployEventsInput = typeof ListDeployEventsInput.Type;
export type GetBoardStateInput = typeof GetBoardStateInput.Type;
export type CreatePanelInput = typeof CreatePanelInput.Type;
export type UpdatePanelInput = typeof UpdatePanelInput.Type;
export type RemovePanelInput = typeof RemovePanelInput.Type;
export type AnnotatePanelInput = typeof AnnotatePanelInput.Type;
export type AddTimelineNoteInput = typeof AddTimelineNoteInput.Type;
export type OpenIncidentInput = typeof OpenIncidentInput.Type;
export type SetHypothesisInput = typeof SetHypothesisInput.Type;
export type CloseIncidentInput = typeof CloseIncidentInput.Type;

export const schemaJson = (schema: Schema.ConstraintDecoder<unknown>) => {
  const document = Schema.toJsonSchemaDocument(schema, {
    additionalProperties: false,
    generateDescriptions: true,
  });
  return {
    ...document.schema,
    ...(Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {}),
  };
};
