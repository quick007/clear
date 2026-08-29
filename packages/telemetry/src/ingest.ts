import { Schema } from "effect";
import { LogRecord } from "./logs.ts";
import { MetricPoint } from "./metrics.ts";
import { SpanRecord } from "./traces.ts";

export const CollectorBatchId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("CollectorBatchId"),
);
export type CollectorBatchId = typeof CollectorBatchId.Type;

export class CanonicalTelemetryBatch extends Schema.Class<CanonicalTelemetryBatch>(
  "Groundtruth/Telemetry/CanonicalTelemetryBatch",
)({
  id: CollectorBatchId,
  receivedAt: Schema.DateTimeUtcFromString,
  metrics: Schema.Array(MetricPoint),
  logs: Schema.Array(LogRecord),
  spans: Schema.Array(SpanRecord),
}) {}
