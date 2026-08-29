import { Schema } from "effect";
import { LogRecord } from "./logs.ts";
import {
  AttributeFilter,
  Cursor,
  InstrumentationScope,
  OtelFlags,
  ResourceContext,
  ServiceName,
  SpanId,
  TelemetryAttributes,
  TimeRange,
  TraceId,
  UnixNano,
  UnsignedCount,
} from "./primitives.ts";

export const SpanKind = Schema.Literals([
  "unspecified",
  "internal",
  "server",
  "client",
  "producer",
  "consumer",
]);
export type SpanKind = typeof SpanKind.Type;

export const SpanStatusCode = Schema.Literals(["unset", "ok", "error"]);
export type SpanStatusCode = typeof SpanStatusCode.Type;

export class SpanStatus extends Schema.Class<SpanStatus>("Groundtruth/Telemetry/SpanStatus")({
  code: SpanStatusCode,
  message: Schema.String,
}) {}

export class SpanEvent extends Schema.Class<SpanEvent>("Groundtruth/Telemetry/SpanEvent")({
  name: Schema.String,
  timeUnixNano: UnixNano,
  attributes: TelemetryAttributes,
  droppedAttributesCount: UnsignedCount,
}) {}

export class SpanLink extends Schema.Class<SpanLink>("Groundtruth/Telemetry/SpanLink")({
  traceId: TraceId,
  spanId: SpanId,
  traceState: Schema.String,
  attributes: TelemetryAttributes,
  droppedAttributesCount: UnsignedCount,
  flags: OtelFlags,
}) {}

export class SpanRecord extends Schema.Class<SpanRecord>("Groundtruth/Telemetry/SpanRecord")({
  traceId: TraceId,
  spanId: SpanId,
  parentSpanId: Schema.NullOr(SpanId),
  traceState: Schema.String,
  flags: OtelFlags,
  name: Schema.String.check(Schema.isLengthBetween(1, 1_000)),
  kind: SpanKind,
  startTimeUnixNano: UnixNano,
  endTimeUnixNano: UnixNano,
  durationNanos: UnsignedCount,
  status: SpanStatus,
  attributes: TelemetryAttributes,
  droppedAttributesCount: UnsignedCount,
  events: Schema.Array(SpanEvent),
  droppedEventsCount: UnsignedCount,
  links: Schema.Array(SpanLink),
  droppedLinksCount: UnsignedCount,
  resource: ResourceContext,
  scope: InstrumentationScope,
  serviceName: ServiceName,
}) {}

const TraceSearchFields = {
  services: Schema.optional(
    Schema.Array(ServiceName).check(Schema.isMaxLength(20), Schema.isUnique()),
  ),
  operation: Schema.optional(Schema.String.check(Schema.isMaxLength(1_000))),
  status: Schema.optional(SpanStatusCode),
  minimumDurationMs: Schema.optional(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  maximumDurationMs: Schema.optional(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  range: Schema.optional(TimeRange),
  filters: Schema.optional(Schema.Array(AttributeFilter).check(Schema.isMaxLength(16))),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  cursor: Schema.optional(Cursor),
} as const;

const TraceSearchStruct = Schema.Struct(TraceSearchFields);

const ValidTraceSearch = TraceSearchStruct.check(
  Schema.makeFilter<typeof TraceSearchStruct.Type>((search) =>
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

export class TraceSearch extends Schema.Class<TraceSearch>("Groundtruth/Telemetry/TraceSearch")(
  ValidTraceSearch,
) {}

export class TraceSummary extends Schema.Class<TraceSummary>("Groundtruth/Telemetry/TraceSummary")({
  traceId: TraceId,
  rootSpanName: Schema.String,
  rootServiceName: ServiceName,
  startTimeUnixNano: UnixNano,
  durationMs: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  status: SpanStatusCode,
  spanCount: Schema.Natural,
  errorSpanCount: Schema.Natural,
  services: Schema.Array(ServiceName).check(Schema.isUnique()),
}) {}

export class TraceSearchPage extends Schema.Class<TraceSearchPage>(
  "Groundtruth/Telemetry/TraceSearchPage",
)({
  traces: Schema.Array(TraceSummary),
  nextCursor: Schema.NullOr(Cursor),
  hasMore: Schema.Boolean,
  hint: Schema.NullOr(Schema.String),
}) {}

export interface TraceTreeNode {
  readonly span: SpanRecord;
  readonly children: ReadonlyArray<TraceTreeNode>;
}

export interface TraceTreeNodeEncoded {
  readonly span: typeof SpanRecord.Encoded;
  readonly children: ReadonlyArray<TraceTreeNodeEncoded>;
}

export const TraceTreeNode: Schema.Codec<TraceTreeNode, TraceTreeNodeEncoded> = Schema.Struct({
  span: SpanRecord,
  children: Schema.Array(
    Schema.suspend((): Schema.Codec<TraceTreeNode, TraceTreeNodeEncoded> => TraceTreeNode),
  ),
}).annotate({ identifier: "Groundtruth/Telemetry/TraceTreeNode" });

export class ServiceEdge extends Schema.Class<ServiceEdge>("Groundtruth/Telemetry/ServiceEdge")({
  source: ServiceName,
  target: ServiceName,
  callCount: Schema.Natural,
  errorCount: Schema.Natural,
  totalDurationMs: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

export class TraceDetail extends Schema.Class<TraceDetail>("Groundtruth/Telemetry/TraceDetail")({
  summary: TraceSummary,
  roots: Schema.Array(TraceTreeNode),
  spans: Schema.Array(SpanRecord),
  correlatedLogs: Schema.Array(LogRecord),
  serviceEdges: Schema.Array(ServiceEdge),
  complete: Schema.Boolean,
  hint: Schema.NullOr(Schema.String),
}) {}
