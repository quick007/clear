import { Schema } from "effect";
import { TraceId } from "./primitives.ts";

const Message = Schema.String.check(Schema.isLengthBetween(1, 1_000));

export class MetricNotFound extends Schema.TaggedError<MetricNotFound>()("MetricNotFound", {
  metric: Schema.String,
  message: Message,
}) {}

export class TraceNotFound extends Schema.TaggedError<TraceNotFound>()("TraceNotFound", {
  traceId: TraceId,
  message: Message,
}) {}

export class QueryTooBroad extends Schema.TaggedError<QueryTooBroad>()("QueryTooBroad", {
  maximumWindowSeconds: Schema.Natural,
  message: Message,
}) {}

export class TelemetryUnavailable extends Schema.TaggedError<TelemetryUnavailable>()(
  "TelemetryUnavailable",
  {
    operation: Schema.String,
    retryable: Schema.Boolean,
    message: Message,
  },
) {}

export const TelemetryQueryError = Schema.Union([
  MetricNotFound,
  TraceNotFound,
  QueryTooBroad,
  TelemetryUnavailable,
]).pipe(Schema.toTaggedUnion("_tag"));
export type TelemetryQueryError = typeof TelemetryQueryError.Type;
