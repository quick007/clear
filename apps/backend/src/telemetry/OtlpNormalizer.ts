import type {
  OtlpLogsRequest,
  OtlpMetricsRequest,
  OtlpTracesRequest,
} from "@groundtruth/api-contract";
import { CanonicalTelemetryBatch, type CollectorBatchId } from "@groundtruth/telemetry";
import { type DateTime, Effect } from "effect";
import { normalizeLogs } from "./LogNormalizer.js";
import { normalizeMetrics } from "./MetricNormalizer.js";
import { normalizeTraces } from "./TraceNormalizer.js";

export const normalizeMetricsRequest = (
  request: OtlpMetricsRequest,
  id: CollectorBatchId,
  receivedAt: DateTime.Utc,
) =>
  normalizeMetrics(request).pipe(
    Effect.map(
      (metrics) => new CanonicalTelemetryBatch({ id, receivedAt, metrics, logs: [], spans: [] }),
    ),
  );

export const normalizeLogsRequest = (
  request: OtlpLogsRequest,
  id: CollectorBatchId,
  receivedAt: DateTime.Utc,
) =>
  normalizeLogs(request).pipe(
    Effect.map(
      (logs) => new CanonicalTelemetryBatch({ id, receivedAt, metrics: [], logs, spans: [] }),
    ),
  );

export const normalizeTracesRequest = (
  request: OtlpTracesRequest,
  id: CollectorBatchId,
  receivedAt: DateTime.Utc,
) =>
  normalizeTraces(request).pipe(
    Effect.map(
      (spans) => new CanonicalTelemetryBatch({ id, receivedAt, metrics: [], logs: [], spans }),
    ),
  );
