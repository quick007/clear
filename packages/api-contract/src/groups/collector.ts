import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi";
import {
  BadRequest,
  IngestKeyRejectedError,
  QuotaExceededError,
  ServiceUnavailable,
} from "../errors.ts";
import {
  AuthorizeIngestRequest,
  CollectorProjectHeaders,
  IngestAuthorization,
  TelemetryAcceptedResponse,
  TelemetryActivityHint,
} from "../model/collector.ts";
import { CollectorServiceAccess } from "../middleware.ts";
import { OtlpLogsPayload } from "../otlp/logs.ts";
import { OtlpMetricsPayload } from "../otlp/metrics.ts";
import { OtlpTracesPayload } from "../otlp/traces.ts";

export class CollectorApi extends HttpApiGroup.make("collector")
  .add(
    HttpApiEndpoint.post("authorizeIngest", "/ingest/authorize", {
      payload: AuthorizeIngestRequest,
      success: IngestAuthorization,
      error: [IngestKeyRejectedError, ServiceUnavailable],
    }),
    HttpApiEndpoint.post("ingestMetrics", "/telemetry/metrics", {
      headers: CollectorProjectHeaders,
      payload: OtlpMetricsPayload,
      success: TelemetryAcceptedResponse,
      error: [BadRequest, IngestKeyRejectedError, QuotaExceededError, ServiceUnavailable],
    }),
    HttpApiEndpoint.post("ingestLogs", "/telemetry/logs", {
      headers: CollectorProjectHeaders,
      payload: OtlpLogsPayload,
      success: TelemetryAcceptedResponse,
      error: [BadRequest, IngestKeyRejectedError, QuotaExceededError, ServiceUnavailable],
    }),
    HttpApiEndpoint.post("ingestTraces", "/telemetry/traces", {
      headers: CollectorProjectHeaders,
      payload: OtlpTracesPayload,
      success: TelemetryAcceptedResponse,
      error: [BadRequest, IngestKeyRejectedError, QuotaExceededError, ServiceUnavailable],
    }),
    HttpApiEndpoint.post("publishActivity", "/telemetry/activity", {
      headers: CollectorProjectHeaders,
      payload: TelemetryActivityHint,
      success: HttpApiSchema.Accepted,
      error: [BadRequest, IngestKeyRejectedError, QuotaExceededError, ServiceUnavailable],
    }),
  )
  .middleware(CollectorServiceAccess)
  .prefix("/internal/v1")
  .annotateMerge(
    OpenApi.annotations({
      title: "Collector",
      description: "Private Collector authorization, canonical OTLP JSON, and activity hints",
      exclude: true,
    }),
  ) {}
