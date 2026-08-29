import type { InvalidCursor, ProjectId, ServiceMetadata } from "@groundtruth/domain";
import type {
  CanonicalTelemetryBatch,
  LogSearch,
  LogSearchPage,
  MetricCatalogEntry,
  MetricQuery,
  MetricQueryResult,
  SignalActivity,
  TraceDetail,
  TraceId,
  TraceSearch,
  TraceSearchPage,
} from "@groundtruth/telemetry";
import { Context, Effect, Layer, Ref, Semaphore } from "effect";
import { persistenceError, type PersistenceError } from "../errors.ts";
import { ClickHouse } from "./client.ts";
import { listServices, listSignalActivity } from "./activity-queries.ts";
import { ingestTelemetry } from "./ingest.ts";
import { searchLogs } from "./log-queries.ts";
import { listMetrics, queryMetrics } from "./metric-queries.ts";
import { clickhouseAttempt } from "./operation.ts";
import { projectParameters } from "./sql.ts";
import { getTrace, searchTraces } from "./trace-queries.ts";

export interface TelemetryRepositoryShape {
  readonly ingest: (
    projectId: ProjectId,
    retentionDays: number,
    batch: CanonicalTelemetryBatch,
  ) => Effect.Effect<void, PersistenceError>;
  readonly listMetrics: (
    projectId: ProjectId,
  ) => Effect.Effect<ReadonlyArray<MetricCatalogEntry>, PersistenceError>;
  readonly listServices: (
    projectId: ProjectId,
  ) => Effect.Effect<ReadonlyArray<ServiceMetadata>, PersistenceError>;
  readonly listSignalActivity: (
    projectId: ProjectId,
  ) => Effect.Effect<ReadonlyArray<SignalActivity>, PersistenceError>;
  readonly queryMetrics: (
    projectId: ProjectId,
    query: MetricQuery,
  ) => Effect.Effect<MetricQueryResult, PersistenceError>;
  readonly searchLogs: (
    projectId: ProjectId,
    search: LogSearch,
  ) => Effect.Effect<LogSearchPage, InvalidCursor | PersistenceError>;
  readonly searchTraces: (
    projectId: ProjectId,
    search: TraceSearch,
  ) => Effect.Effect<TraceSearchPage, InvalidCursor | PersistenceError>;
  readonly getTrace: (
    projectId: ProjectId,
    traceId: TraceId,
  ) => Effect.Effect<TraceDetail | null, PersistenceError>;
  readonly purgeProject: (projectId: ProjectId) => Effect.Effect<void, PersistenceError>;
  readonly sealAndPurgeProject: (projectId: ProjectId) => Effect.Effect<void, PersistenceError>;
}

export class TelemetryRepository extends Context.Service<
  TelemetryRepository,
  TelemetryRepositoryShape
>()("Groundtruth/TelemetryRepository") {}

const purgeTables = [
  "metric_exemplars",
  "metric_points",
  "logs",
  "span_events",
  "span_links",
  "spans",
  "metric_numeric_rollups_10s",
  "trace_rollups_10s",
  "log_rollups_10s",
] as const;

export const TelemetryRepositoryLive = Layer.effect(
  TelemetryRepository,
  Effect.gen(function* () {
    const { client } = yield* ClickHouse;
    const lifecycleGate = yield* Semaphore.make(1);
    const sealedProjects = yield* Ref.make<ReadonlySet<ProjectId>>(new Set());
    const deleteProjectTelemetry = (projectId: ProjectId) =>
      Effect.forEach(
        purgeTables,
        (table) =>
          clickhouseAttempt(`purge ${table}`, (signal) =>
            client.command({
              query: `ALTER TABLE groundtruth.${table} DELETE WHERE project_id = {projectId:UUID}`,
              query_params: projectParameters(projectId),
              clickhouse_settings: { mutations_sync: "2" },
              abort_signal: signal,
            }),
          ),
        { concurrency: 1, discard: true },
      );
    const ingest = (projectId: ProjectId, retentionDays: number, batch: CanonicalTelemetryBatch) =>
      lifecycleGate.withPermits(1)(
        Effect.gen(function* () {
          const sealed = yield* Ref.get(sealedProjects);
          if (sealed.has(projectId)) {
            return yield* Effect.fail(
              persistenceError(
                "clickhouse",
                "ingest sealed project",
                "Project telemetry ingestion is closed",
                false,
              ),
            );
          }
          yield* ingestTelemetry(client, projectId, retentionDays, batch);
        }),
      );
    const purgeProject = (projectId: ProjectId) =>
      lifecycleGate.withPermits(1)(deleteProjectTelemetry(projectId));
    const sealAndPurgeProject = (projectId: ProjectId) =>
      lifecycleGate.withPermits(1)(
        Ref.update(sealedProjects, (current) => new Set(current).add(projectId)).pipe(
          Effect.andThen(deleteProjectTelemetry(projectId)),
        ),
      );

    return {
      ingest,
      listMetrics: (projectId) => listMetrics(client, projectId),
      listServices: (projectId) => listServices(client, projectId),
      listSignalActivity: (projectId) => listSignalActivity(client, projectId),
      queryMetrics: (projectId, query) => queryMetrics(client, projectId, query),
      searchLogs: (projectId, search) => searchLogs(client, projectId, search),
      searchTraces: (projectId, search) => searchTraces(client, projectId, search),
      getTrace: (projectId, traceId) => getTrace(client, projectId, traceId),
      purgeProject,
      sealAndPurgeProject,
    };
  }),
);
