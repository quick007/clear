import type { ProjectId } from "@groundtruth/domain";
import {
  ServiceEdge,
  type SpanRecord,
  TraceDetail,
  type TraceId,
  TraceSearchPage,
  TraceSummary,
  type TraceTreeNode,
} from "@groundtruth/telemetry";
import { Clock, Context, Effect, Layer, Ref } from "effect";
import {
  TelemetryRepository,
  type TelemetryRepositoryShape,
} from "../clickhouse/telemetry-repository.ts";
import { persistenceError } from "../errors.ts";
import {
  compareTraceCursors,
  decodeTracePageCursor,
  encodeTracePageCursor,
  inRange,
  matchesFilters,
  recordQueryAttributes,
  searchLogs,
  traceCursorFor,
} from "./in-memory-query-support.ts";
import { listMetrics, queryMetrics } from "./in-memory-metrics.ts";
import {
  listServicesFromBatches,
  listSignalActivityFromBatches,
} from "./in-memory-telemetry-overview.ts";
import {
  emptyTelemetryMemoryState,
  makeTelemetryMemoryControl,
  TelemetryMemoryControl,
  type TelemetryMemoryState,
} from "./in-memory-telemetry-state.ts";

export * from "./in-memory-telemetry-state.ts";

const projectBatches = (state: TelemetryMemoryState, projectId: ProjectId) =>
  (state.projects.get(projectId) ?? []).map(({ batch }) => batch);

const projectSignals = (state: TelemetryMemoryState, projectId: ProjectId) => {
  const batches = projectBatches(state, projectId);
  return {
    metrics: batches.flatMap(({ metrics }) => metrics),
    logs: batches.flatMap(({ logs }) => logs),
    spans: batches.flatMap(({ spans }) => spans),
  };
};
const summarizeTrace = (spans: ReadonlyArray<SpanRecord>) => {
  const root = spans.find(({ parentSpanId }) => parentSpanId === null) ?? spans[0]!;
  const start = spans.reduce(
    (value, span) => (span.startTimeUnixNano < value ? span.startTimeUnixNano : value),
    root.startTimeUnixNano,
  );
  const end = spans.reduce(
    (value, span) => (span.endTimeUnixNano > value ? span.endTimeUnixNano : value),
    root.endTimeUnixNano,
  );
  const errorSpanCount = spans.filter(({ status }) => status.code === "error").length;
  return new TraceSummary({
    traceId: root.traceId,
    rootSpanName: root.name,
    rootServiceName: root.serviceName,
    startTimeUnixNano: start,
    durationMs: Number(end - start) / 1_000_000,
    status:
      errorSpanCount > 0
        ? "error"
        : spans.some(({ status }) => status.code === "ok")
          ? "ok"
          : "unset",
    spanCount: spans.length,
    errorSpanCount,
    services: [...new Set(spans.map(({ serviceName }) => serviceName))],
  });
};

const tracesById = (spans: ReadonlyArray<SpanRecord>) =>
  Map.groupBy(spans, ({ traceId }) => traceId);

const buildTraceTree = (spans: ReadonlyArray<SpanRecord>): ReadonlyArray<TraceTreeNode> => {
  const nodes = new Map(
    spans.map((span) => [span.spanId, { span, children: [] as Array<TraceTreeNode> }]),
  );
  const roots: Array<TraceTreeNode> = [];
  for (const node of nodes.values()) {
    const parent = node.span.parentSpanId === null ? undefined : nodes.get(node.span.parentSpanId);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }
  return roots;
};

const buildServiceEdges = (spans: ReadonlyArray<SpanRecord>) => {
  const byId = new Map(spans.map((span) => [span.spanId, span]));
  const edges = new Map<
    string,
    {
      source: SpanRecord["serviceName"];
      target: SpanRecord["serviceName"];
      callCount: number;
      errorCount: number;
      totalDurationMs: number;
    }
  >();
  for (const span of spans) {
    const parent = span.parentSpanId === null ? undefined : byId.get(span.parentSpanId);
    if (parent === undefined || parent.serviceName === span.serviceName) continue;
    const key = `${parent.serviceName}\0${span.serviceName}`;
    const edge = edges.get(key) ?? {
      source: parent.serviceName,
      target: span.serviceName,
      callCount: 0,
      errorCount: 0,
      totalDurationMs: 0,
    };
    edge.callCount += 1;
    edge.errorCount += span.status.code === "error" ? 1 : 0;
    edge.totalDurationMs += Number(span.durationNanos) / 1_000_000;
    edges.set(key, edge);
  }
  return [...edges.values()].map((edge) => new ServiceEdge(edge));
};

const searchTraces = (
  spans: ReadonlyArray<SpanRecord>,
  search: Parameters<TelemetryRepositoryShape["searchTraces"]>[1],
  nowMillis: number,
) =>
  Effect.gen(function* () {
    const cursor = search.cursor === undefined ? null : yield* decodeTracePageCursor(search.cursor);
    const operation = search.operation?.toLowerCase();
    const matchingIds = new Set(
      spans
        .filter(
          (span) =>
            (search.services === undefined || search.services.includes(span.serviceName)) &&
            (operation === undefined || span.name.toLowerCase().includes(operation)) &&
            inRange(span.startTimeUnixNano, search.range, nowMillis) &&
            matchesFilters(recordQueryAttributes(span), search.filters ?? []),
        )
        .map(({ traceId }) => traceId),
    );
    const summaries = [...tracesById(spans)]
      .filter(([traceId]) => matchingIds.has(traceId))
      .map(([, traceSpans]) => summarizeTrace(traceSpans))
      .filter(
        (summary) =>
          (search.status === undefined || summary.status === search.status) &&
          (search.minimumDurationMs === undefined ||
            summary.durationMs >= search.minimumDurationMs) &&
          (search.maximumDurationMs === undefined ||
            summary.durationMs <= search.maximumDurationMs),
      )
      .filter(
        (summary) => cursor === null || compareTraceCursors(traceCursorFor(summary), cursor) < 0,
      )
      .sort((left, right) =>
        compareTraceCursors(traceCursorFor(right), {
          _tag: "traces",
          ...traceCursorFor(left),
        }),
      );
    const limit = search.limit ?? 50;
    const traces = summaries.slice(0, limit);
    const hasMore = summaries.length > limit;
    const last = traces.at(-1);
    return new TraceSearchPage({
      traces,
      hasMore,
      nextCursor:
        hasMore && last !== undefined ? encodeTracePageCursor(traceCursorFor(last)) : null,
      hint: hasMore ? "Continue with nextCursor for older traces." : null,
    });
  });

const getTrace = (signals: ReturnType<typeof projectSignals>, traceId: TraceId) => {
  const allSpans = signals.spans.filter((span) => span.traceId === traceId);
  if (allSpans.length === 0) return null;
  const spans = allSpans.slice(0, 5_000);
  const allLogs = signals.logs.filter((log) => log.traceId === traceId);
  const correlatedLogs = allLogs
    .sort((left, right) => (left.timeUnixNano < right.timeUnixNano ? -1 : 1))
    .slice(0, 200);
  const complete = allSpans.length <= 5_000 && allLogs.length <= 200;
  return new TraceDetail({
    summary: summarizeTrace(spans),
    roots: buildTraceTree(spans),
    spans,
    correlatedLogs,
    serviceEdges: buildServiceEdges(spans),
    complete,
    hint: complete
      ? null
      : "This unusually large trace was truncated to protect the query service.",
  });
};

export const makeInMemoryTelemetryRepository = (
  state: Ref.Ref<TelemetryMemoryState>,
): TelemetryRepositoryShape => ({
  ingest: (projectId, retentionDays, batch) =>
    Ref.modify(state, (current) => {
      if (current.sealedProjects.has(projectId)) return [false, current];
      const projects = new Map(current.projects);
      const existing = projects.get(projectId) ?? [];
      if (existing.some(({ batch: stored }) => stored.id === batch.id)) return [true, current];
      projects.set(projectId, [...existing, { retentionDays, batch }]);
      return [true, { ...current, projects }];
    }).pipe(
      Effect.flatMap((stored) =>
        stored
          ? Effect.void
          : Effect.fail(
              persistenceError(
                "clickhouse",
                "ingest sealed project",
                "Project telemetry ingestion is closed",
                false,
              ),
            ),
      ),
    ),
  listMetrics: (projectId) =>
    Ref.get(state).pipe(
      Effect.map((current) => listMetrics(projectSignals(current, projectId).metrics)),
    ),
  listServices: (projectId) =>
    Ref.get(state).pipe(
      Effect.map((current) =>
        listServicesFromBatches(projectId, projectBatches(current, projectId)),
      ),
    ),
  listSignalActivity: (projectId) =>
    Ref.get(state).pipe(
      Effect.map((current) => listSignalActivityFromBatches(projectBatches(current, projectId))),
    ),
  queryMetrics: (projectId, query) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      return queryMetrics(projectSignals(yield* Ref.get(state), projectId).metrics, query, now);
    }),
  searchLogs: (projectId, search) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      return yield* searchLogs(projectSignals(yield* Ref.get(state), projectId).logs, search, now);
    }),
  searchTraces: (projectId, search) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      return yield* searchTraces(
        projectSignals(yield* Ref.get(state), projectId).spans,
        search,
        now,
      );
    }),
  getTrace: (projectId, traceId) =>
    Ref.get(state).pipe(
      Effect.map((current) => getTrace(projectSignals(current, projectId), traceId)),
    ),
  purgeProject: (projectId) =>
    Ref.update(state, (current) => {
      const projects = new Map(current.projects);
      projects.delete(projectId);
      return { ...current, projects };
    }),
  sealAndPurgeProject: (projectId) =>
    Ref.update(state, (current) => {
      const projects = new Map(current.projects);
      projects.delete(projectId);
      return {
        projects,
        sealedProjects: new Set(current.sealedProjects).add(projectId),
      };
    }),
});

export const InMemoryTelemetryRepositoryLive = Layer.effectContext(
  Effect.gen(function* () {
    const state = yield* Ref.make(emptyTelemetryMemoryState());
    return Context.make(TelemetryRepository, makeInMemoryTelemetryRepository(state)).pipe(
      Context.add(TelemetryMemoryControl, makeTelemetryMemoryControl(state)),
    );
  }),
);
