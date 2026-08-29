import { Schema } from "effect";
import {
  OtlpAnyValue,
  OtlpInstrumentationScope,
  OtlpKeyValue,
  OtlpResource,
  OtlpSpanId,
  OtlpTraceId,
  OtlpUint64,
} from "./common.ts";
import { withOtlpStructureBudget } from "./complexity.ts";

export const OtlpSeverityNumber = Schema.Literals([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
]);

export const OtlpLogRecord = Schema.Struct({
  timeUnixNano: Schema.optional(OtlpUint64),
  observedTimeUnixNano: Schema.optional(OtlpUint64),
  severityNumber: Schema.optional(OtlpSeverityNumber),
  severityText: Schema.optional(Schema.String),
  body: Schema.optional(OtlpAnyValue),
  attributes: Schema.optional(Schema.Array(OtlpKeyValue)),
  droppedAttributesCount: Schema.optional(Schema.Natural),
  flags: Schema.optional(Schema.Natural),
  traceId: Schema.optional(OtlpTraceId),
  spanId: Schema.optional(OtlpSpanId),
  eventName: Schema.optional(Schema.String),
});

export const OtlpScopeLogs = Schema.Struct({
  scope: Schema.optional(OtlpInstrumentationScope),
  logRecords: Schema.optional(Schema.Array(OtlpLogRecord)),
  schemaUrl: Schema.optional(Schema.String),
});

export const OtlpResourceLogs = Schema.Struct({
  resource: Schema.optional(OtlpResource),
  scopeLogs: Schema.optional(Schema.Array(OtlpScopeLogs)),
  schemaUrl: Schema.optional(Schema.String),
});

export class OtlpLogsRequest extends Schema.Class<OtlpLogsRequest>("Groundtruth/OtlpLogsRequest")({
  resourceLogs: Schema.optional(Schema.Array(OtlpResourceLogs)),
}) {}

export const OtlpLogsPayload = withOtlpStructureBudget(OtlpLogsRequest);
