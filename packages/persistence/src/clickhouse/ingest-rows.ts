import type { ProjectId } from "@groundtruth/domain";
import {
  type CanonicalTelemetryBatch,
  type Exemplar,
  type InstrumentationScope,
  type LogRecord,
  type MetricNumberValue,
  type MetricPoint,
  type ResourceContext,
  TelemetryBytes,
  TelemetryInteger,
  type TelemetryAttributes,
  type TelemetryValue,
  type SpanRecord,
} from "@groundtruth/telemetry";
import { DateTime } from "effect";
import { formatDateTime64 } from "./sql.ts";

const formatExpiry = (receivedAt: DateTime.Utc, retentionDays: number) => {
  const milliseconds = DateTime.toEpochMillis(receivedAt) + retentionDays * 86_400_000;
  return new Date(milliseconds).toISOString().replace("T", " ").slice(0, 19);
};

const canonicalize = (value: TelemetryValue): unknown => {
  if (value instanceof TelemetryBytes) {
    return { _tag: "bytes", value: Buffer.from(value.value).toString("base64") };
  }
  if (value instanceof TelemetryInteger) {
    return { _tag: "int", value: value.value.toString() };
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

const stringifyTelemetryValue = (value: TelemetryValue) => JSON.stringify(canonicalize(value));
const stringifyAttributes = (attributes: TelemetryAttributes) =>
  JSON.stringify(canonicalize(attributes));

const stringifyResourceContext = (resource: ResourceContext) =>
  JSON.stringify({
    attributes: canonicalize(resource.attributes),
    droppedAttributesCount: resource.droppedAttributesCount.toString(),
    entityRefs: resource.entityRefs.map((reference) => ({
      schemaUrl: reference.schemaUrl,
      type: reference.type,
      idKeys: reference.idKeys,
      descriptionKeys: reference.descriptionKeys,
    })),
    schemaUrl: resource.schemaUrl,
  });

const stringifyScopeContext = (scope: InstrumentationScope) =>
  JSON.stringify({
    name: scope.name,
    version: scope.version,
    attributes: canonicalize(scope.attributes),
    droppedAttributesCount: scope.droppedAttributesCount.toString(),
    schemaUrl: scope.schemaUrl,
  });

const stringifyMetricPayload = (attributes: TelemetryAttributes, metadata: TelemetryAttributes) =>
  JSON.stringify({
    attributes: canonicalize(attributes),
    metadata: canonicalize(metadata),
  });

const flattenAttributes = (attributes: TelemetryAttributes) =>
  Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      typeof value === "string"
        ? value
        : value instanceof TelemetryInteger
          ? value.value.toString()
          : typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : stringifyTelemetryValue(value),
    ]),
  );

const queryAttributes = (
  record: Pick<MetricPoint | LogRecord | SpanRecord, "attributes" | "resource" | "serviceName">,
) => ({
  ...flattenAttributes(record.resource.attributes),
  ...flattenAttributes(record.attributes),
  "service.name": String(record.serviceName),
});

const nullableText = (value: string | null) => value ?? "";
const contextColumns = (
  record: Pick<MetricPoint | LogRecord | SpanRecord, "resource" | "scope" | "serviceName">,
) => ({
  service_name: record.serviceName,
  resource_schema_url: nullableText(record.resource.schemaUrl),
  resource_attributes: flattenAttributes(record.resource.attributes),
  resource_attributes_json: stringifyResourceContext(record.resource),
  scope_name: record.scope.name,
  scope_version: nullableText(record.scope.version),
  scope_schema_url: nullableText(record.scope.schemaUrl),
  scope_attributes: flattenAttributes(record.scope.attributes),
  scope_attributes_json: stringifyScopeContext(record.scope),
});

const numberColumns = (value: MetricNumberValue | null) => ({
  value_type: value?._tag ?? "none",
  int_value: value?._tag === "int" ? value.value.toString() : "0",
  double_value: value?._tag === "double" ? value.value : 0,
});

const metricShapeColumns = (point: MetricPoint) => {
  switch (point._tag) {
    case "gauge":
      return numberColumns(point.value);
    case "sum":
      return {
        ...numberColumns(point.value),
        aggregation_temporality: point.temporality,
        is_monotonic: point.monotonic,
      };
    case "histogram":
      return {
        count: point.count.toString(),
        has_sum: point.sum !== null,
        sum: point.sum ?? 0,
        has_min: point.minimum !== null,
        min: point.minimum ?? 0,
        has_max: point.maximum !== null,
        max: point.maximum ?? 0,
        aggregation_temporality: point.temporality,
        explicit_bounds: point.explicitBounds,
        bucket_counts: point.bucketCounts.map(String),
      };
    case "exponential-histogram":
      return {
        count: point.count.toString(),
        has_sum: point.sum !== null,
        sum: point.sum ?? 0,
        has_min: point.minimum !== null,
        min: point.minimum ?? 0,
        has_max: point.maximum !== null,
        max: point.maximum ?? 0,
        aggregation_temporality: point.temporality,
        exponential_scale: point.scale,
        exponential_zero_count: point.zeroCount.toString(),
        exponential_zero_threshold: point.zeroThreshold,
        positive_offset: point.positive.offset,
        positive_bucket_counts: point.positive.bucketCounts.map(String),
        negative_offset: point.negative.offset,
        negative_bucket_counts: point.negative.bucketCounts.map(String),
      };
    case "summary":
      return {
        count: point.count.toString(),
        has_sum: true,
        sum: point.sum,
        summary_quantiles: point.quantiles.map(({ quantile }) => quantile),
        summary_values: point.quantiles.map(({ value }) => value),
      };
  }
};

export const metricInsertRows = (
  projectId: ProjectId,
  retentionDays: number,
  batch: CanonicalTelemetryBatch,
  acceptedAt: DateTime.Utc,
) => {
  const ingestedAt = formatDateTime64(acceptedAt);
  return batch.metrics.map((point) => ({
    project_id: projectId,
    ingested_at: ingestedAt,
    expires_at: formatExpiry(acceptedAt, retentionDays),
    time_unix_nano: point.timeUnixNano.toString(),
    start_time_unix_nano: point.startTimeUnixNano?.toString() ?? "0",
    metric_name: point.name,
    metric_description: point.description,
    metric_unit: point.unit,
    metric_type: point._tag === "exponential-histogram" ? "exponential_histogram" : point._tag,
    aggregation_temporality: "unspecified",
    is_monotonic: false,
    flags: point.flags,
    ...numberColumns(null),
    count: "0",
    has_sum: false,
    sum: 0,
    has_min: false,
    min: 0,
    has_max: false,
    max: 0,
    explicit_bounds: [],
    bucket_counts: [],
    exponential_scale: 0,
    exponential_zero_count: "0",
    exponential_zero_threshold: 0,
    positive_offset: 0,
    positive_bucket_counts: [],
    negative_offset: 0,
    negative_bucket_counts: [],
    summary_quantiles: [],
    summary_values: [],
    ...contextColumns(point),
    attributes: queryAttributes(point),
    attributes_json: stringifyMetricPayload(point.attributes, point.metadata),
    dropped_attributes_count: 0,
    ...metricShapeColumns(point),
  }));
};

export const metricSeriesHashInputs = (batch: CanonicalTelemetryBatch) =>
  batch.metrics.map((point, ordinal) => ({
    ordinal,
    metricName: point.name,
    resourceAttributesJson: stringifyResourceContext(point.resource),
    scopeName: point.scope.name,
    attributesJson: stringifyMetricPayload(point.attributes, point.metadata),
  }));

export const exemplarInsertRows = (
  projectId: ProjectId,
  retentionDays: number,
  batch: CanonicalTelemetryBatch,
  seriesHashes: ReadonlyMap<number, string>,
  acceptedAt: DateTime.Utc,
) => {
  const ingestedAt = formatDateTime64(acceptedAt);
  return batch.metrics.flatMap((point, ordinal) =>
    point.exemplars.map((exemplar: Exemplar) => ({
      project_id: projectId,
      ingested_at: ingestedAt,
      expires_at: formatExpiry(acceptedAt, retentionDays),
      time_unix_nano: exemplar.timeUnixNano.toString(),
      metric_name: point.name,
      series_hash: seriesHashes.get(ordinal) ?? "0",
      trace_id: exemplar.traceId ?? "",
      span_id: exemplar.spanId ?? "",
      ...numberColumns(exemplar.value),
      filtered_attributes: flattenAttributes(exemplar.filteredAttributes),
      filtered_attributes_json: stringifyAttributes(exemplar.filteredAttributes),
    })),
  );
};

const bodyText = (value: TelemetryValue) => {
  if (typeof value === "string") return value;
  if (value instanceof TelemetryInteger) return value.value.toString();
  if (value instanceof TelemetryBytes) {
    return `[bytes: ${Buffer.from(value.value).toString("base64")}]`;
  }
  return stringifyTelemetryValue(value);
};

export const logInsertRows = (
  projectId: ProjectId,
  retentionDays: number,
  batch: CanonicalTelemetryBatch,
  acceptedAt: DateTime.Utc,
) => {
  const ingestedAt = formatDateTime64(acceptedAt);
  return batch.logs.map((record, logOrdinal) => ({
    project_id: projectId,
    batch_id: batch.id,
    log_ordinal: logOrdinal,
    ingested_at: ingestedAt,
    expires_at: formatExpiry(acceptedAt, retentionDays),
    time_unix_nano: record.timeUnixNano.toString(),
    observed_time_unix_nano: record.observedTimeUnixNano.toString(),
    trace_id: record.traceId ?? "",
    span_id: record.spanId ?? "",
    flags: record.flags,
    severity_number: record.severityNumber,
    severity_text: record.severityText ?? "",
    event_name: record.eventName ?? "",
    body: bodyText(record.body),
    body_json: stringifyTelemetryValue(record.body),
    ...contextColumns(record),
    attributes: queryAttributes(record),
    attributes_json: stringifyAttributes(record.attributes),
    dropped_attributes_count: record.droppedAttributesCount.toString(),
  }));
};

export const spanInsertRows = (
  projectId: ProjectId,
  retentionDays: number,
  batch: CanonicalTelemetryBatch,
  acceptedAt: DateTime.Utc,
) => {
  const ingestedAt = formatDateTime64(acceptedAt);
  return batch.spans.map((span) => ({
    project_id: projectId,
    ingested_at: ingestedAt,
    expires_at: formatExpiry(acceptedAt, retentionDays),
    trace_id: span.traceId,
    span_id: span.spanId,
    parent_span_id: span.parentSpanId ?? "",
    trace_state: span.traceState,
    flags: span.flags,
    span_name: span.name,
    span_kind: span.kind,
    start_time_unix_nano: span.startTimeUnixNano.toString(),
    end_time_unix_nano: span.endTimeUnixNano.toString(),
    status_code: span.status.code,
    status_message: span.status.message,
    ...contextColumns(span),
    attributes: queryAttributes(span),
    attributes_json: stringifyAttributes(span.attributes),
    dropped_attributes_count: span.droppedAttributesCount.toString(),
    dropped_events_count: span.droppedEventsCount.toString(),
    dropped_links_count: span.droppedLinksCount.toString(),
  }));
};

export const spanEventInsertRows = (
  projectId: ProjectId,
  retentionDays: number,
  batch: CanonicalTelemetryBatch,
  acceptedAt: DateTime.Utc,
) =>
  batch.spans.flatMap((span) =>
    span.events.map((event, eventIndex) => ({
      project_id: projectId,
      expires_at: formatExpiry(acceptedAt, retentionDays),
      trace_id: span.traceId,
      span_id: span.spanId,
      event_index: eventIndex,
      event_name: event.name,
      time_unix_nano: event.timeUnixNano.toString(),
      attributes: flattenAttributes(event.attributes),
      attributes_json: stringifyAttributes(event.attributes),
      dropped_attributes_count: event.droppedAttributesCount.toString(),
    })),
  );

export const spanLinkInsertRows = (
  projectId: ProjectId,
  retentionDays: number,
  batch: CanonicalTelemetryBatch,
  acceptedAt: DateTime.Utc,
) =>
  batch.spans.flatMap((span) =>
    span.links.map((link, linkIndex) => ({
      project_id: projectId,
      expires_at: formatExpiry(acceptedAt, retentionDays),
      trace_id: span.traceId,
      span_id: span.spanId,
      link_index: linkIndex,
      linked_trace_id: link.traceId,
      linked_span_id: link.spanId,
      trace_state: link.traceState,
      flags: link.flags,
      attributes: flattenAttributes(link.attributes),
      attributes_json: stringifyAttributes(link.attributes),
      dropped_attributes_count: link.droppedAttributesCount.toString(),
    })),
  );
