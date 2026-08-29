import { Schema } from "effect";

import {
  AlertSeverity,
  Attributes,
  LogSeverity,
  MetricName,
  ScenarioPhase,
  Sequence,
  Sha,
  SpanId,
  SpanKind,
  SpanStatus,
  Timestamp,
  TraceId,
} from "./primitives.ts";

export const MetricPoint = Schema.TaggedUnion({
  Sum: {
    metric: MetricName,
    timestamp: Timestamp,
    value: Schema.Natural,
    attributes: Attributes,
  },
  Gauge: {
    metric: MetricName,
    timestamp: Timestamp,
    value: Schema.Finite,
    attributes: Attributes,
  },
  Histogram: {
    metric: MetricName,
    timestamp: Timestamp,
    count: Schema.Natural,
    sum: Schema.Finite,
    min: Schema.Finite,
    max: Schema.Finite,
    p50: Schema.Finite,
    p95: Schema.Finite,
    p99: Schema.Finite,
    attributes: Attributes,
  },
});
export type MetricPoint = typeof MetricPoint.Type;

export class SpanEvent extends Schema.Class<SpanEvent>("SpanEvent")({
  name: Schema.String.check(Schema.isNonEmpty()),
  timestamp: Timestamp,
  attributes: Attributes,
}) {}

const SpanFields = Schema.Struct({
  traceId: TraceId,
  spanId: SpanId,
  parentSpanId: Schema.NullOr(SpanId),
  service: Schema.String.check(Schema.isNonEmpty()),
  name: Schema.String.check(Schema.isNonEmpty()),
  kind: SpanKind,
  status: SpanStatus,
  startTime: Timestamp,
  endTime: Timestamp,
  attributes: Attributes,
  events: Schema.Array(SpanEvent),
}).check(
  Schema.makeFilter((span) =>
    span.endTime >= span.startTime
      ? undefined
      : { path: ["endTime"], issue: "Span end time must not precede its start" },
  ),
);

export class Span extends Schema.Class<Span>("Span")(SpanFields) {}

const TraceFields = Schema.Struct({
  traceId: TraceId,
  rootSpanId: SpanId,
  spans: Schema.NonEmptyArray(Span),
}).check(
  Schema.makeFilter((trace) => {
    const issues: Array<Schema.FilterIssue> = [];
    const root = trace.spans.find((span) => span.spanId === trace.rootSpanId);
    if (root === undefined || root.parentSpanId !== null) {
      issues.push({
        path: ["rootSpanId"],
        issue: "Trace rootSpanId must identify a root span",
      });
    }
    if (trace.spans.some((span) => span.traceId !== trace.traceId)) {
      issues.push({
        path: ["spans"],
        issue: "Every span must carry the containing trace ID",
      });
    }
    return issues;
  }),
);

export class Trace extends Schema.Class<Trace>("Trace")(TraceFields) {}

export class LogRecord extends Schema.Class<LogRecord>("LogRecord")({
  timestamp: Timestamp,
  severity: LogSeverity,
  service: Schema.String.check(Schema.isNonEmpty()),
  body: Schema.String.check(Schema.isNonEmpty()),
  traceId: Schema.NullOr(TraceId),
  spanId: Schema.NullOr(SpanId),
  attributes: Attributes,
}) {}

export const AlertEvent = Schema.TaggedUnion({
  AlertFired: {
    alertId: Schema.String.check(Schema.isNonEmpty()),
    name: Schema.String.check(Schema.isNonEmpty()),
    severity: AlertSeverity,
    metric: MetricName,
    threshold: Schema.Finite,
    observed: Schema.Finite,
    timestamp: Timestamp,
  },
  AlertResolved: {
    alertId: Schema.String.check(Schema.isNonEmpty()),
    name: Schema.String.check(Schema.isNonEmpty()),
    severity: AlertSeverity,
    metric: MetricName,
    threshold: Schema.Finite,
    observed: Schema.Finite,
    timestamp: Timestamp,
  },
});
export type AlertEvent = typeof AlertEvent.Type;

export class DeployAnnotation extends Schema.Class<DeployAnnotation>("DeployAnnotation")({
  service: Schema.String.check(Schema.isNonEmpty()),
  sha: Sha,
  description: Schema.String.check(Schema.isNonEmpty()),
  url: Schema.NullOr(Schema.String),
  timestamp: Timestamp,
}) {}

const TelemetryBatchFields = Schema.Struct({
  sequence: Sequence,
  phase: ScenarioPhase,
  bucketStart: Timestamp,
  bucketEnd: Timestamp,
  metrics: Schema.Array(MetricPoint),
  logs: Schema.Array(LogRecord),
  traces: Schema.Array(Trace),
  alerts: Schema.Array(AlertEvent),
  annotations: Schema.Array(DeployAnnotation),
}).check(
  Schema.makeFilter((batch) =>
    batch.bucketEnd > batch.bucketStart
      ? undefined
      : { path: ["bucketEnd"], issue: "Bucket end must be after its start" },
  ),
);

export class TelemetryBatch extends Schema.Class<TelemetryBatch>("TelemetryBatch")(
  TelemetryBatchFields,
) {}
