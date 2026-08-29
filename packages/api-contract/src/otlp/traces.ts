import { Schema } from "effect";
import {
  OtlpInstrumentationScope,
  OtlpKeyValue,
  OtlpResource,
  OtlpSpanId,
  OtlpTraceId,
  OtlpUint64,
} from "./common.ts";
import { withOtlpStructureBudget } from "./complexity.ts";

export const OtlpSpanKind = Schema.Literals([0, 1, 2, 3, 4, 5]);
export const OtlpStatusCode = Schema.Literals([0, 1, 2]);

export const OtlpSpanEvent = Schema.Struct({
  timeUnixNano: Schema.optional(OtlpUint64),
  name: Schema.optional(Schema.String),
  attributes: Schema.optional(Schema.Array(OtlpKeyValue)),
  droppedAttributesCount: Schema.optional(Schema.Natural),
});

export const OtlpSpanLink = Schema.Struct({
  traceId: Schema.optional(OtlpTraceId),
  spanId: Schema.optional(OtlpSpanId),
  traceState: Schema.optional(Schema.String),
  attributes: Schema.optional(Schema.Array(OtlpKeyValue)),
  droppedAttributesCount: Schema.optional(Schema.Natural),
  flags: Schema.optional(Schema.Natural),
});

export const OtlpSpanStatus = Schema.Struct({
  message: Schema.optional(Schema.String),
  code: Schema.optional(OtlpStatusCode),
});

export const OtlpSpan = Schema.Struct({
  traceId: Schema.optional(OtlpTraceId),
  spanId: Schema.optional(OtlpSpanId),
  traceState: Schema.optional(Schema.String),
  parentSpanId: Schema.optional(OtlpSpanId),
  flags: Schema.optional(Schema.Natural),
  name: Schema.optional(Schema.String),
  kind: Schema.optional(OtlpSpanKind),
  startTimeUnixNano: Schema.optional(OtlpUint64),
  endTimeUnixNano: Schema.optional(OtlpUint64),
  attributes: Schema.optional(Schema.Array(OtlpKeyValue)),
  droppedAttributesCount: Schema.optional(Schema.Natural),
  events: Schema.optional(Schema.Array(OtlpSpanEvent)),
  droppedEventsCount: Schema.optional(Schema.Natural),
  links: Schema.optional(Schema.Array(OtlpSpanLink)),
  droppedLinksCount: Schema.optional(Schema.Natural),
  status: Schema.optional(OtlpSpanStatus),
});

export const OtlpScopeSpans = Schema.Struct({
  scope: Schema.optional(OtlpInstrumentationScope),
  spans: Schema.optional(Schema.Array(OtlpSpan)),
  schemaUrl: Schema.optional(Schema.String),
});

export const OtlpResourceSpans = Schema.Struct({
  resource: Schema.optional(OtlpResource),
  scopeSpans: Schema.optional(Schema.Array(OtlpScopeSpans)),
  schemaUrl: Schema.optional(Schema.String),
});

export class OtlpTracesRequest extends Schema.Class<OtlpTracesRequest>(
  "Groundtruth/OtlpTracesRequest",
)({
  resourceSpans: Schema.optional(Schema.Array(OtlpResourceSpans)),
}) {}

export const OtlpTracesPayload = withOtlpStructureBudget(OtlpTracesRequest);
