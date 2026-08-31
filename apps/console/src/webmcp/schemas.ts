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
  schema.annotateKey({ description });
const optionalDescribed = <S extends Schema.Top>(schema: S, description: string) =>
  Schema.optionalKey(schema).annotateKey({ description });

export const NoInput = Schema.Record(Schema.String, Schema.Never);

export const ListAlertsInput = Schema.Struct({
  status: optionalDescribed(
    Schema.Literals(["healthy", "firing", "resolved"]),
    "Restrict alerts to one current state.",
  ),
  severity: optionalDescribed(
    Schema.Literals(["info", "warning", "critical"]),
    "Restrict alerts to one severity.",
  ),
  service: optionalDescribed(DomainServiceName, "Restrict alerts to one service."),
  window: optionalDescribed(
    TelemetryWindow,
    "Restrict alerts to this recent relative time window.",
  ),
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
  comparison: described(
    Schema.Literals(["above", "at-or-above", "below", "at-or-below"]),
    "How the aggregated value is compared with the threshold.",
  ),
  threshold: described(Schema.Finite, "Finite value that changes the rule to firing."),
  windowSeconds: described(
    Schema.Int.check(Schema.isBetween({ minimum: 10, maximum: 86_400 })),
    "Evaluation window in seconds, from 10 seconds through 24 hours.",
  ),
  severity: described(AlertSeverity, "Severity assigned while the rule is firing."),
  enabled: optionalDescribed(
    Schema.Boolean,
    "Whether the rule starts evaluating immediately. Defaults to true.",
  ),
});

export const RemoveAlertRuleInput = Schema.Struct({
  alertId: described(AlertId, "Alert rule ID returned by list_alerts."),
});

const QueryMetricsInputStruct = Schema.Struct({
  metric: described(MetricName, "OpenTelemetry metric name returned by list_metrics."),
  aggregation: described(MetricAggregation, "Aggregation to calculate for each result series."),
  distinctKey: optionalDescribed(
    AttributeKey,
    "Attribute to count. Required only when aggregation is count-distinct.",
  ),
  window: described(TelemetryWindow, "Relative time window to query."),
  step: optionalDescribed(
    QueryStep,
    "Time between returned points. Clear chooses it when omitted.",
  ),
  filters: optionalDescribed(
    Schema.Array(AttributeFilter).check(Schema.isMaxLength(16)),
    "Up to 16 attribute filters applied before aggregation.",
  ),
  groupBy: optionalDescribed(
    Schema.Array(AttributeKey).check(Schema.isMaxLength(2), Schema.isUnique()),
    "Up to two unique catalogued attributes used to split result series.",
  ),
  maxSeries: optionalDescribed(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16 })),
    "Maximum result series. Defaults to 12 and cannot exceed 16.",
  ),
  maxPoints: optionalDescribed(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 240 })),
    "Maximum points across the bounded query. Defaults to 120.",
  ),
});

export const QueryMetricsInput = QueryMetricsInputStruct.check(
  Schema.makeFilter<typeof QueryMetricsInputStruct.Type>((query) => {
    if (query.aggregation === "count-distinct" && query.distinctKey === undefined) {
      return {
        path: ["distinctKey"],
        issue: "count-distinct queries must name the attribute to count",
      };
    }
    if (query.aggregation !== "count-distinct" && query.distinctKey !== undefined) {
      return {
        path: ["distinctKey"],
        issue: "distinctKey is supported only by count-distinct queries",
      };
    }
    return undefined;
  }),
);

export const SearchLogsInput = Schema.Struct({
  services: optionalDescribed(
    Schema.Array(ServiceName).check(Schema.isMaxLength(10), Schema.isUnique()),
    "Up to 10 unique observed services to search.",
  ),
  severities: optionalDescribed(
    Schema.Array(LogSeverity).check(Schema.isUnique()),
    "Unique severities to include.",
  ),
  query: optionalDescribed(
    Schema.String.check(Schema.isMaxLength(1_000)),
    "Text to find in log bodies and attributes.",
  ),
  traceId: optionalDescribed(TraceId, "Restrict logs to one trace ID."),
  window: optionalDescribed(
    TelemetryWindow,
    "Relative time window. Clear chooses a default when omitted.",
  ),
  filters: optionalDescribed(
    Schema.Array(AttributeFilter).check(Schema.isMaxLength(16)),
    "Up to 16 structured attribute filters.",
  ),
  limit: optionalDescribed(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })),
    "Maximum records on this page. Defaults to 30.",
  ),
  cursor: optionalDescribed(Cursor, "Opaque cursor returned by the previous page."),
});

export const SampleLogsInput = Schema.Struct({
  service: described(ServiceName, "Observed service returned by list_services."),
  severity: optionalDescribed(LogSeverity, "Restrict the sample to one severity."),
  window: optionalDescribed(TelemetryWindow, "Relative time window to sample."),
  limit: optionalDescribed(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })),
    "Maximum sampled records. Defaults to 30.",
  ),
});

const SearchTracesInputStruct = Schema.Struct({
  services: optionalDescribed(
    Schema.Array(ServiceName).check(Schema.isMaxLength(10), Schema.isUnique()),
    "Up to 10 unique observed services to search.",
  ),
  operation: optionalDescribed(
    Schema.String.check(Schema.isMaxLength(1_000)),
    "Operation or span name to match.",
  ),
  status: optionalDescribed(SpanStatusCode, "Root trace status to include."),
  minimumDurationMs: optionalDescribed(
    Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
    "Minimum trace duration in milliseconds.",
  ),
  maximumDurationMs: optionalDescribed(
    Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
    "Maximum trace duration in milliseconds; must not be below the minimum.",
  ),
  window: optionalDescribed(TelemetryWindow, "Relative time window to search."),
  filters: optionalDescribed(
    Schema.Array(AttributeFilter).check(Schema.isMaxLength(16)),
    "Up to 16 structured span-attribute filters.",
  ),
  limit: optionalDescribed(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })),
    "Maximum traces on this page. Defaults to 30.",
  ),
  cursor: optionalDescribed(Cursor, "Opaque cursor returned by the previous page."),
});

export const SearchTracesInput = SearchTracesInputStruct.check(
  Schema.makeFilter<typeof SearchTracesInputStruct.Type>((search) =>
    search.minimumDurationMs === undefined ||
    search.maximumDurationMs === undefined ||
    search.minimumDurationMs <= search.maximumDurationMs
      ? undefined
      : {
          path: ["maximumDurationMs"],
          issue: "maximumDurationMs must be greater than or equal to minimumDurationMs",
        },
  ),
);

export const GetTraceInput = Schema.Struct({
  traceId: described(TraceId, "Trace ID returned by search_traces or search_logs."),
});

export const ListDeployEventsInput = Schema.Struct({
  service: optionalDescribed(DomainServiceName, "Restrict deploy events to one observed service."),
  window: optionalDescribed(TelemetryWindow, "Relative time window to list."),
  cursor: optionalDescribed(ApiCursor, "Opaque cursor returned by the previous page."),
  limit: optionalDescribed(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })),
    "Maximum events on this page. Defaults to 30.",
  ),
});

export const GetBoardStateInput = Schema.Struct({
  dashboardId: optionalDescribed(
    DashboardId,
    "Dashboard ID to read. Uses the active board when omitted.",
  ),
});

export const CreatePanelInput = Schema.Struct({
  dashboardId: described(DashboardId, "Dashboard ID returned by get_console_overview."),
  spec: described(PanelSpec, "Validated metric chart, stat, or table specification."),
  position: optionalDescribed(Schema.Natural, "Zero-based panel position in the shared board."),
});

export const UpdatePanelInput = Schema.Struct({
  panelId: described(PanelId, "Panel ID returned by get_board_state."),
  spec: described(PanelSpec, "Complete replacement panel specification."),
  position: optionalDescribed(Schema.Natural, "New zero-based panel position."),
  expectedRevision: described(
    Schema.Natural,
    "Current panel revision returned by get_board_state.",
  ),
});

export const RemovePanelInput = Schema.Struct({
  panelId: described(PanelId, "Panel ID returned by get_board_state."),
});

export const AnnotatePanelInput = Schema.Struct({
  panelId: described(PanelId, "Panel ID returned by get_board_state."),
  at: optionalDescribed(
    Schema.DateTimeUtcFromString,
    "UTC ISO timestamp. Uses the current time when omitted.",
  ),
  label: described(
    Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 500)),
    "Short note shown on the panel timeline.",
  ),
});

export const AddTimelineNoteInput = Schema.Struct({
  text: described(
    Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 10_000)),
    "Concise evidence or decision to add to the incident timeline.",
  ),
});

export const OpenIncidentInput = Schema.Struct({
  title: described(IncidentTitle, "Concise incident title visible on the shared board."),
});

export const SetHypothesisInput = Schema.Struct({
  hypothesisId: optionalDescribed(
    HypothesisId,
    "Existing hypothesis ID to update. Omit to create one.",
  ),
  text: described(
    Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 10_000)),
    "Evidence-testable root-cause statement.",
  ),
  status: described(HypothesisStatus, "Current evidence status for the hypothesis."),
});

export const CloseIncidentInput = Schema.Struct({
  summary: described(
    Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 10_000)),
    "Evidence-based root cause and outcome recorded on the incident.",
  ),
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

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isDescriptionOnlySchema = (value: unknown): value is Readonly<{ description: string }> =>
  isRecord(value) && Object.keys(value).length === 1 && typeof value.description === "string";

function normalizeSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSchemaValue);
  if (!isRecord(value)) return value;
  return hoistPropertyDescription(value);
}

function hoistPropertyDescription(
  schema: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const normalized = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, normalizeSchemaValue(value)]),
  );
  if (!Array.isArray(normalized.allOf)) return normalized;

  const description = normalized.allOf.find(isDescriptionOnlySchema)?.description;
  if (description === undefined) return normalized;

  const remaining = normalized.allOf.filter((entry) => !isDescriptionOnlySchema(entry));
  const { allOf: _allOf, ...withoutAllOf } = normalized;
  return {
    ...withoutAllOf,
    description,
    ...(remaining.length === 0 ? {} : { allOf: remaining }),
  };
}

export const schemaJson = (schema: Schema.ConstraintDecoder<unknown>) => {
  const document = Schema.toJsonSchemaDocument(schema, {
    additionalProperties: false,
    generateDescriptions: true,
  });
  return hoistPropertyDescription({
    ...document.schema,
    ...(Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {}),
  });
};
