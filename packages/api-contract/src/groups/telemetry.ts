import {
  LogSearch,
  LogSearchPage,
  LogSeverity,
  MetricCatalogEntry,
  MetricQuery,
  MetricQueryResult,
  ServiceName,
  TelemetryWindow,
  TraceDetail,
  TraceId,
  TraceSearch,
  TraceSearchPage,
} from "@groundtruth/telemetry";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi";
import { TelemetryReadErrors } from "../errors.ts";
import { ProjectPath, SampleLimitFromString } from "../model/common.ts";
import { GroundtruthAccess } from "../middleware.ts";

const logsSampleQuery = {
  service: ServiceName,
  severity: Schema.optional(LogSeverity),
  window: Schema.optional(TelemetryWindow),
  limit: Schema.optional(SampleLimitFromString),
} as const;

export class TelemetryApi extends HttpApiGroup.make("telemetry")
  .add(
    HttpApiEndpoint.get("listMetrics", "/:projectId/metrics", {
      params: ProjectPath,
      success: Schema.Array(MetricCatalogEntry),
      error: TelemetryReadErrors,
    }),
    HttpApiEndpoint.post("queryMetrics", "/:projectId/metrics/query", {
      params: ProjectPath,
      payload: MetricQuery,
      success: MetricQueryResult,
      error: TelemetryReadErrors,
    }),
    HttpApiEndpoint.post("searchLogs", "/:projectId/logs/search", {
      params: ProjectPath,
      payload: LogSearch,
      success: LogSearchPage,
      error: TelemetryReadErrors,
    }),
    HttpApiEndpoint.get("sampleLogs", "/:projectId/logs/sample", {
      params: ProjectPath,
      query: logsSampleQuery,
      success: LogSearchPage,
      error: TelemetryReadErrors,
    }),
    HttpApiEndpoint.post("searchTraces", "/:projectId/traces/search", {
      params: ProjectPath,
      payload: TraceSearch,
      success: TraceSearchPage,
      error: TelemetryReadErrors,
    }),
    HttpApiEndpoint.get("getTrace", "/:projectId/traces/:traceId", {
      params: {
        ...ProjectPath,
        traceId: TraceId,
      },
      success: TraceDetail,
      error: TelemetryReadErrors,
    }),
  )
  .middleware(GroundtruthAccess)
  .prefix("/v1/projects")
  .annotateMerge(
    OpenApi.annotations({
      title: "Telemetry",
      description: "Metric, log, and trace discovery and query endpoints",
    }),
  ) {}
