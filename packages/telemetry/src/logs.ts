import { Schema } from "effect";
import {
  AttributeFilter,
  Cursor,
  InstrumentationScope,
  OtelFlags,
  ResourceContext,
  ServiceName,
  SpanId,
  TelemetryAttributes,
  TelemetryValue,
  TimeRange,
  TraceId,
  UnixNano,
  UnsignedCount,
} from "./primitives.ts";

export const LogSeverity = Schema.Literals([
  "unspecified",
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);
export type LogSeverity = typeof LogSeverity.Type;

export class LogSearch extends Schema.Class<LogSearch>("Groundtruth/Telemetry/LogSearch")({
  services: Schema.optional(
    Schema.Array(ServiceName).check(Schema.isMaxLength(20), Schema.isUnique()),
  ),
  severities: Schema.optional(Schema.Array(LogSeverity).check(Schema.isUnique())),
  query: Schema.optional(Schema.String.check(Schema.isMaxLength(1_000))),
  traceId: Schema.optional(TraceId),
  spanId: Schema.optional(SpanId),
  range: Schema.optional(TimeRange),
  filters: Schema.optional(Schema.Array(AttributeFilter).check(Schema.isMaxLength(16))),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))),
  cursor: Schema.optional(Cursor),
}) {}

export class LogRecord extends Schema.Class<LogRecord>("Groundtruth/Telemetry/LogRecord")({
  timeUnixNano: UnixNano,
  observedTimeUnixNano: UnixNano,
  traceId: Schema.NullOr(TraceId),
  spanId: Schema.NullOr(SpanId),
  flags: OtelFlags,
  severity: LogSeverity,
  severityNumber: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 24 })),
  severityText: Schema.NullOr(Schema.String),
  body: TelemetryValue,
  eventName: Schema.NullOr(Schema.String),
  attributes: TelemetryAttributes,
  droppedAttributesCount: UnsignedCount,
  resource: ResourceContext,
  scope: InstrumentationScope,
  serviceName: ServiceName,
}) {}

export class LogSearchPage extends Schema.Class<LogSearchPage>(
  "Groundtruth/Telemetry/LogSearchPage",
)({
  records: Schema.Array(LogRecord),
  nextCursor: Schema.NullOr(Cursor),
  hasMore: Schema.Boolean,
  hint: Schema.NullOr(Schema.String),
}) {}
