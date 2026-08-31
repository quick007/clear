import { InvalidCursor, type ProjectId, type ServiceMetadata } from "@groundtruth/domain";
import {
  type CanonicalTelemetryBatch,
  aggregateMetricPoints,
  type LogRecord,
  type LogSearch,
  type LogSearchPage,
  type MetricCatalogEntry,
  type MetricAggregateQuery,
  type MetricAggregateResult,
  type MetricNotFound,
  type MetricPoint,
  type MetricQuery,
  type MetricQueryResult,
  maximumMetricQuerySeconds,
  metricQueryDurationSeconds,
  metricQuerySupportsRollups,
  metricQueryUsesRollups,
  QueryTooBroad,
  rawMetricRetentionSeconds,
  SignalActivity,
  SignalHealth,
  type SignalKind,
  type SpanRecord,
  TelemetryUnavailable,
  type TraceDetail,
  type TraceId,
  TraceNotFound,
  type TraceSearch,
  type TraceSearchPage,
} from "@groundtruth/telemetry";
import {
  DashboardRepository,
  type PersistenceError,
  ProjectRepository,
  TelemetryRepository,
} from "@groundtruth/persistence";
import { Clock, Context, Effect, Layer, Option, Ref, Result } from "effect";
import { isSandboxProjectId } from "../memory/SeedIds.js";
import {
  discoveredServiceNames,
  standardServiceOverview,
} from "../board/StandardServiceOverview.js";
import { listMetricCatalog, queryMetricPoints } from "./MetricQueryEngine.js";
import { getTraceDetail, searchLogRecords, searchTraceRecords } from "./SearchEngine.js";
import { listServicesFromTelemetry, signalHealthFromActivities } from "./TelemetryViews.js";

interface ProjectTelemetry {
  readonly batches: ReadonlyArray<CanonicalTelemetryBatch>;
  readonly metrics: ReadonlyArray<MetricPoint>;
  readonly logs: ReadonlyArray<LogRecord>;
  readonly spans: ReadonlyArray<SpanRecord>;
  readonly activities: ReadonlyArray<SignalActivity>;
}

const emptyProject: ProjectTelemetry = {
  batches: [],
  metrics: [],
  logs: [],
  spans: [],
  activities: [],
};

const activityFor = (batch: CanonicalTelemetryBatch) => {
  const activity = <A extends { readonly serviceName: SignalActivity["services"][number] }>(
    signal: SignalKind,
    items: ReadonlyArray<A>,
  ) =>
    items.length === 0
      ? []
      : [
          new SignalActivity({
            signal,
            services: Array.from(new Set(items.map((item) => item.serviceName))),
            itemCount: items.length,
            observedAt: batch.receivedAt,
          }),
        ];
  return [
    ...activity("metrics", batch.metrics),
    ...activity("logs", batch.logs),
    ...activity("traces", batch.spans),
  ];
};

const appendBatch = (
  current: ProjectTelemetry,
  batch: CanonicalTelemetryBatch,
): ProjectTelemetry =>
  current.batches.some((stored) => stored.id === batch.id)
    ? current
    : {
        batches: [...current.batches, batch],
        metrics: [...current.metrics, ...batch.metrics],
        logs: [...current.logs, ...batch.logs],
        spans: [...current.spans, ...batch.spans],
        activities: [...current.activities, ...activityFor(batch)],
      };

const fromBatches = (batches: ReadonlyArray<CanonicalTelemetryBatch>) =>
  batches.reduce(appendBatch, emptyProject);

const signalHealth = (telemetry: ProjectTelemetry) =>
  signalHealthFromActivities(telemetry.activities);

type QueryMetricError = MetricNotFound | QueryTooBroad | TelemetryUnavailable;
type SearchError = InvalidCursor | TelemetryUnavailable;
type GetTraceError = TraceNotFound | TelemetryUnavailable;

const persistenceUnavailable = (error: PersistenceError) =>
  new TelemetryUnavailable({
    operation: `${error.store}.${error.operation}`,
    retryable: error.retryable,
    message: `Telemetry storage operation failed (reference ${error.correlationId})`,
  });

const hostedReplaceUnsupported = (projectId: ProjectId) =>
  new TelemetryUnavailable({
    operation: "replace hosted telemetry",
    retryable: false,
    message: `Replacing all telemetry is supported only for sandbox projects, not ${projectId}`,
  });

const validateMetricQuery = (query: MetricQuery, hosted: boolean) => {
  const duration = metricQueryDurationSeconds(query);
  if (duration > maximumMetricQuerySeconds) {
    return Effect.fail(
      new QueryTooBroad({
        maximumWindowSeconds: maximumMetricQuerySeconds,
        message: "Metric queries are limited to a 7 day window",
      }),
    );
  }
  if (hosted && metricQueryUsesRollups(query) && !metricQuerySupportsRollups(query)) {
    return Effect.fail(
      new QueryTooBroad({
        maximumWindowSeconds: rawMetricRetentionSeconds,
        message:
          "Metric queries longer than 24 hours support numeric aggregates, optional service.name grouping, and service.name filters",
      }),
    );
  }
  return Effect.void;
};

export class TelemetryStore extends Context.Service<
  TelemetryStore,
  {
    ingest(
      projectId: ProjectId,
      batch: CanonicalTelemetryBatch,
    ): Effect.Effect<void, TelemetryUnavailable>;
    replace(
      projectId: ProjectId,
      batches: ReadonlyArray<CanonicalTelemetryBatch>,
    ): Effect.Effect<void, TelemetryUnavailable>;
    clear(projectId: ProjectId): Effect.Effect<void, TelemetryUnavailable>;
    recordActivity(
      projectId: ProjectId,
      activities: ReadonlyArray<SignalActivity>,
    ): Effect.Effect<void, TelemetryUnavailable>;
    listMetrics(
      projectId: ProjectId,
    ): Effect.Effect<ReadonlyArray<MetricCatalogEntry>, TelemetryUnavailable>;
    aggregateMetric(
      projectId: ProjectId,
      query: MetricAggregateQuery,
    ): Effect.Effect<MetricAggregateResult, TelemetryUnavailable>;
    queryMetrics(
      projectId: ProjectId,
      query: MetricQuery,
    ): Effect.Effect<MetricQueryResult, QueryMetricError>;
    searchLogs(projectId: ProjectId, query: LogSearch): Effect.Effect<LogSearchPage, SearchError>;
    searchTraces(
      projectId: ProjectId,
      query: TraceSearch,
    ): Effect.Effect<TraceSearchPage, SearchError>;
    getTrace(projectId: ProjectId, traceId: TraceId): Effect.Effect<TraceDetail, GetTraceError>;
    listServices(
      projectId: ProjectId,
    ): Effect.Effect<ReadonlyArray<ServiceMetadata>, TelemetryUnavailable>;
    signalHealth(
      projectId: ProjectId,
    ): Effect.Effect<ReadonlyArray<SignalHealth>, TelemetryUnavailable>;
  }
>()("groundtruth/backend/telemetry/TelemetryStore") {
  static readonly layerMemory = Layer.effect(
    TelemetryStore,
    Effect.gen(function* () {
      const state = yield* Ref.make<ReadonlyMap<ProjectId, ProjectTelemetry>>(new Map());
      const get = (projectId: ProjectId) =>
        Ref.get(state).pipe(Effect.map((projects) => projects.get(projectId) ?? emptyProject));
      const set = (projectId: ProjectId, telemetry: ProjectTelemetry) =>
        Ref.update(state, (projects) => new Map(projects).set(projectId, telemetry));
      const ingest = Effect.fn("TelemetryStore.ingest")(function* (
        projectId: ProjectId,
        batch: CanonicalTelemetryBatch,
      ) {
        yield* Ref.update(state, (projects) => {
          const current = projects.get(projectId) ?? emptyProject;
          return new Map(projects).set(projectId, appendBatch(current, batch));
        });
      });
      const replace = Effect.fn("TelemetryStore.replace")(function* (
        projectId: ProjectId,
        batches: ReadonlyArray<CanonicalTelemetryBatch>,
      ) {
        yield* set(projectId, fromBatches(batches));
      });
      const clear = Effect.fn("TelemetryStore.clear")(function* (projectId: ProjectId) {
        yield* set(projectId, emptyProject);
      });
      const recordActivity = Effect.fn("TelemetryStore.recordActivity")(function* (
        projectId: ProjectId,
        activities: ReadonlyArray<SignalActivity>,
      ) {
        yield* Ref.update(state, (projects) => {
          const current = projects.get(projectId) ?? emptyProject;
          return new Map(projects).set(projectId, {
            ...current,
            activities: [...current.activities, ...activities],
          });
        });
      });
      const aggregateMetric = Effect.fn("TelemetryStore.aggregateMetric")(function* (
        projectId: ProjectId,
        query: MetricAggregateQuery,
      ) {
        const telemetry = yield* get(projectId);
        const result = aggregateMetricPoints(
          telemetry.metrics,
          query,
          yield* Clock.currentTimeMillis,
        );
        if (Result.isSuccess(result)) return result.success;
        return yield* new TelemetryUnavailable({
          operation: "aggregate in-memory metric points",
          retryable: false,
          message: result.failure.reason,
        });
      });

      return TelemetryStore.of({
        ingest,
        replace,
        clear,
        recordActivity,
        listMetrics: (projectId) =>
          get(projectId).pipe(Effect.map((telemetry) => listMetricCatalog(telemetry.metrics))),
        aggregateMetric,
        queryMetrics: (projectId, query) =>
          get(projectId).pipe(
            Effect.flatMap((telemetry) => queryMetricPoints(telemetry.metrics, query)),
          ),
        searchLogs: (projectId, query) =>
          get(projectId).pipe(
            Effect.flatMap((telemetry) => searchLogRecords(telemetry.logs, query)),
          ),
        searchTraces: (projectId, query) =>
          get(projectId).pipe(
            Effect.flatMap((telemetry) => searchTraceRecords(telemetry.spans, query)),
          ),
        getTrace: (projectId, traceId) =>
          get(projectId).pipe(
            Effect.flatMap((telemetry) => getTraceDetail(telemetry.spans, telemetry.logs, traceId)),
          ),
        listServices: (projectId) =>
          get(projectId).pipe(
            Effect.map((telemetry) => listServicesFromTelemetry(projectId, telemetry)),
          ),
        signalHealth: (projectId) => get(projectId).pipe(Effect.flatMap(signalHealth)),
      });
    }),
  );

  static readonly layerPersistence = Layer.effect(
    TelemetryStore,
    Effect.gen(function* () {
      const repository = yield* TelemetryRepository;
      const projects = yield* ProjectRepository;
      const dashboards = yield* DashboardRepository;
      const memoryContext = yield* Layer.build(TelemetryStore.layerMemory);
      const memory = Context.get(memoryContext, TelemetryStore);
      const reportedActivities = yield* Ref.make<
        ReadonlyMap<ProjectId, ReadonlyArray<SignalActivity>>
      >(new Map());
      const getReportedActivities = (projectId: ProjectId) =>
        Ref.get(reportedActivities).pipe(Effect.map((all) => all.get(projectId) ?? []));
      const deleteReportedActivities = (projectId: ProjectId) =>
        Ref.update(reportedActivities, (all) => {
          const next = new Map(all);
          next.delete(projectId);
          return next;
        });

      const retentionDays = Effect.fn("TelemetryStore.retentionDays")(function* (
        projectId: ProjectId,
      ) {
        const project = yield* projects
          .findById(projectId)
          .pipe(Effect.mapError(persistenceUnavailable));
        if (Option.isNone(project)) {
          return yield* new TelemetryUnavailable({
            operation: "resolve project retention",
            retryable: false,
            message: `Hosted project ${projectId} does not exist`,
          });
        }
        return project.value.retentionDays;
      });

      const ingestHosted = Effect.fn("TelemetryStore.ingestHosted")(function* (
        projectId: ProjectId,
        batch: CanonicalTelemetryBatch,
      ) {
        const retention = yield* retentionDays(projectId);
        yield* repository
          .ingest(projectId, retention, batch)
          .pipe(Effect.mapError(persistenceUnavailable));
        const serviceNames = discoveredServiceNames(batch);
        if (serviceNames.length > 0) {
          yield* dashboards
            .seedIfEmpty(projectId, standardServiceOverview(serviceNames))
            .pipe(Effect.mapError(persistenceUnavailable));
        }
      });

      const ingest = (projectId: ProjectId, batch: CanonicalTelemetryBatch) =>
        isSandboxProjectId(projectId)
          ? memory.ingest(projectId, batch)
          : ingestHosted(projectId, batch);
      const replace = (projectId: ProjectId, batches: ReadonlyArray<CanonicalTelemetryBatch>) =>
        isSandboxProjectId(projectId)
          ? memory.replace(projectId, batches)
          : Effect.fail(hostedReplaceUnsupported(projectId));
      const clear = (projectId: ProjectId) =>
        isSandboxProjectId(projectId)
          ? memory.clear(projectId)
          : repository.purgeProject(projectId).pipe(
              Effect.mapError(persistenceUnavailable),
              Effect.tap(() => deleteReportedActivities(projectId)),
            );
      const recordActivity = (projectId: ProjectId, activities: ReadonlyArray<SignalActivity>) =>
        isSandboxProjectId(projectId)
          ? memory.recordActivity(projectId, activities)
          : Ref.update(reportedActivities, (all) => {
              const current = all.get(projectId) ?? [];
              const maximumReportedActivities = 100;
              return new Map(all).set(
                projectId,
                [...current, ...activities].slice(-maximumReportedActivities),
              );
            });
      const listMetrics = (projectId: ProjectId) =>
        isSandboxProjectId(projectId)
          ? memory.listMetrics(projectId)
          : repository.listMetrics(projectId).pipe(Effect.mapError(persistenceUnavailable));
      const aggregateMetric = (projectId: ProjectId, query: MetricAggregateQuery) =>
        isSandboxProjectId(projectId)
          ? memory.aggregateMetric(projectId, query)
          : repository
              .aggregateMetric(projectId, query)
              .pipe(Effect.mapError(persistenceUnavailable));
      const queryMetrics = (projectId: ProjectId, query: MetricQuery) => {
        const sandbox = isSandboxProjectId(projectId);
        return validateMetricQuery(query, !sandbox).pipe(
          Effect.andThen(
            sandbox
              ? memory.queryMetrics(projectId, query)
              : repository
                  .queryMetrics(projectId, query)
                  .pipe(Effect.mapError(persistenceUnavailable)),
          ),
        );
      };
      const searchLogs = (projectId: ProjectId, query: LogSearch) =>
        isSandboxProjectId(projectId)
          ? memory.searchLogs(projectId, query)
          : repository
              .searchLogs(projectId, query)
              .pipe(
                Effect.catchTag("PersistenceError", (error) =>
                  Effect.fail(persistenceUnavailable(error)),
                ),
              );
      const searchTraces = (projectId: ProjectId, query: TraceSearch) =>
        isSandboxProjectId(projectId)
          ? memory.searchTraces(projectId, query)
          : repository
              .searchTraces(projectId, query)
              .pipe(
                Effect.catchTag("PersistenceError", (error) =>
                  Effect.fail(persistenceUnavailable(error)),
                ),
              );
      const getTrace = (projectId: ProjectId, traceId: TraceId) =>
        isSandboxProjectId(projectId)
          ? memory.getTrace(projectId, traceId)
          : repository.getTrace(projectId, traceId).pipe(
              Effect.mapError(persistenceUnavailable),
              Effect.flatMap((detail) =>
                detail === null
                  ? Effect.fail(new TraceNotFound({ traceId, message: "Trace not found" }))
                  : Effect.succeed(detail),
              ),
            );
      const listHostedServices = (projectId: ProjectId) =>
        repository.listServices(projectId).pipe(Effect.mapError(persistenceUnavailable));
      const hostedSignalHealth = (projectId: ProjectId) =>
        Effect.all([
          repository.listSignalActivity(projectId).pipe(Effect.mapError(persistenceUnavailable)),
          getReportedActivities(projectId),
        ]).pipe(
          Effect.flatMap(([persisted, reported]) =>
            signalHealthFromActivities([...persisted, ...reported]),
          ),
        );

      return TelemetryStore.of({
        ingest,
        replace,
        clear,
        recordActivity,
        listMetrics,
        aggregateMetric,
        queryMetrics,
        searchLogs,
        searchTraces,
        getTrace,
        listServices: (projectId) =>
          isSandboxProjectId(projectId)
            ? memory.listServices(projectId)
            : listHostedServices(projectId),
        signalHealth: (projectId) =>
          isSandboxProjectId(projectId)
            ? memory.signalHealth(projectId)
            : hostedSignalHealth(projectId),
      });
    }),
  );
}
