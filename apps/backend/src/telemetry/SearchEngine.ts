import { InvalidCursor } from "@groundtruth/domain";
import {
  type Cursor,
  LogSearchPage,
  type LogRecord,
  type LogSearch,
  RelativeTimeRange,
  ServiceEdge,
  type SpanRecord,
  TraceDetail,
  TraceNotFound,
  type TraceSearch,
  TraceSearchPage,
  TraceSummary,
  type TraceTreeNode,
} from "@groundtruth/telemetry";
import { createHash } from "node:crypto";
import { Effect, Schema } from "effect";
import {
  combinedAttributes,
  decodeCursor,
  encodeCursor,
  matchesFilters,
  nanosToMillis,
  renderValue,
  timeBounds,
} from "./QuerySupport.js";

const maximumTraceSpans = 5_000;
const maximumCorrelatedLogs = 200;

const within = (at: bigint, bounds: { readonly start: number; readonly end: number }) => {
  const millis = nanosToMillis(at);
  return millis >= bounds.start && millis <= bounds.end;
};

const searchableLog = (record: LogRecord) =>
  [
    record.severityText ?? "",
    record.eventName ?? "",
    renderValue(record.body),
    ...Object.entries(record.attributes).map(([key, value]) => `${key}=${renderValue(value)}`),
  ]
    .join(" ")
    .toLowerCase();

const decimalString = Schema.String.check(Schema.isPattern(/^(?:0|[1-9][0-9]*)$/));
const LogCursorValue = Schema.Struct({
  _tag: Schema.Literals(["logs"]),
  recordIndex: decimalString,
  timeUnixNano: decimalString,
  observedTimeUnixNano: decimalString,
  traceId: Schema.String,
  spanId: Schema.String,
  serviceName: Schema.String,
  bodyHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
});
type LogCursorValue = typeof LogCursorValue.Type;

const TraceCursorValue = Schema.Struct({
  _tag: Schema.Literals(["traces"]),
  startTimeUnixNano: decimalString,
  traceId: Schema.String,
});
type TraceCursorValue = typeof TraceCursorValue.Type;

const invalidCursor = (cursor: Cursor) =>
  new InvalidCursor({
    rawCursor: cursor,
    message: "Telemetry cursor is malformed or no longer valid",
  });

const decodeLogCursor = (cursor: Cursor | undefined) => {
  if (cursor === undefined) return Effect.succeed(null);
  return decodeCursor(cursor).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(LogCursorValue)),
    Effect.mapError(() => invalidCursor(cursor)),
  );
};

const decodeTraceCursor = (cursor: Cursor | undefined) => {
  if (cursor === undefined) return Effect.succeed(null);
  return decodeCursor(cursor).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(TraceCursorValue)),
    Effect.mapError(() => invalidCursor(cursor)),
  );
};

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const compareDecimal = (left: string, right: string) =>
  BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0;

const logCursorFor = (record: LogRecord, recordIndex: number): LogCursorValue => ({
  _tag: "logs",
  recordIndex: String(recordIndex),
  timeUnixNano: String(record.timeUnixNano),
  observedTimeUnixNano: String(record.observedTimeUnixNano),
  traceId: String(record.traceId ?? ""),
  spanId: String(record.spanId ?? ""),
  serviceName: String(record.serviceName),
  bodyHash: createHash("sha256").update(renderValue(record.body)).digest("hex"),
});

const compareLogCursors = (left: LogCursorValue, right: LogCursorValue) =>
  compareDecimal(left.timeUnixNano, right.timeUnixNano) ||
  compareDecimal(left.observedTimeUnixNano, right.observedTimeUnixNano) ||
  compareText(left.traceId, right.traceId) ||
  compareText(left.spanId, right.spanId) ||
  compareText(left.serviceName, right.serviceName) ||
  compareText(left.bodyHash, right.bodyHash) ||
  compareDecimal(left.recordIndex, right.recordIndex);

const traceCursorFor = (summary: TraceSummary): TraceCursorValue => ({
  _tag: "traces",
  startTimeUnixNano: String(summary.startTimeUnixNano),
  traceId: String(summary.traceId),
});

const compareTraceCursors = (left: TraceCursorValue, right: TraceCursorValue) =>
  compareDecimal(left.startTimeUnixNano, right.startTimeUnixNano) ||
  compareText(left.traceId, right.traceId);

export const searchLogRecords = (records: ReadonlyArray<LogRecord>, query: LogSearch) =>
  Effect.gen(function* () {
    const bounds = yield* timeBounds(query.range ?? new RelativeTimeRange({ window: "15m" }));
    const cursor = yield* decodeLogCursor(query.cursor);
    const limit = query.limit ?? 100;
    const needle = query.query?.trim().toLowerCase();
    const matches = records
      .map((record, recordIndex) => ({ record, cursor: logCursorFor(record, recordIndex) }))
      .filter(({ record }) => {
        if (!within(record.timeUnixNano, bounds)) return false;
        if (query.services !== undefined && !query.services.includes(record.serviceName))
          return false;
        if (query.severities !== undefined && !query.severities.includes(record.severity))
          return false;
        if (query.traceId !== undefined && record.traceId !== query.traceId) return false;
        if (query.spanId !== undefined && record.spanId !== query.spanId) return false;
        const all = combinedAttributes(
          String(record.serviceName),
          record.resource.attributes,
          record.attributes,
        );
        if (!matchesFilters(all, query.filters)) return false;
        return (
          needle === undefined || needle.length === 0 || searchableLog(record).includes(needle)
        );
      })
      .filter((entry) => cursor === null || compareLogCursors(entry.cursor, cursor) < 0)
      .sort((left, right) => compareLogCursors(right.cursor, left.cursor));
    const page = matches.slice(0, limit);
    const hasMore = matches.length > limit;
    const last = page.at(-1);
    return new LogSearchPage({
      records: page.map(({ record }) => record),
      nextCursor: hasMore && last !== undefined ? encodeCursor(last.cursor) : null,
      hasMore,
      hint:
        query.cursor === undefined && matches.length === 0
          ? "Broaden the time range or remove a filter"
          : hasMore
            ? "Continue with nextCursor for older log records"
            : null,
    });
  });

const traceSummary = (spans: ReadonlyArray<SpanRecord>) => {
  const byId = new Set(spans.map((span) => span.spanId));
  const roots = spans.filter((span) => span.parentSpanId === null || !byId.has(span.parentSpanId));
  const root = (roots.length > 0 ? roots : spans)
    .slice()
    .sort((left, right) => Number(left.startTimeUnixNano - right.startTimeUnixNano))[0];
  if (root === undefined) return null;
  const start = spans.reduce(
    (minimum, span) => (span.startTimeUnixNano < minimum ? span.startTimeUnixNano : minimum),
    root.startTimeUnixNano,
  );
  const end = spans.reduce(
    (maximum, span) => (span.endTimeUnixNano > maximum ? span.endTimeUnixNano : maximum),
    root.endTimeUnixNano,
  );
  const errorSpanCount = spans.filter((span) => span.status.code === "error").length;
  return new TraceSummary({
    traceId: root.traceId,
    rootSpanName: root.name,
    rootServiceName: root.serviceName,
    startTimeUnixNano: start,
    durationMs: Number(end - start) / 1_000_000,
    status:
      errorSpanCount > 0
        ? "error"
        : spans.some((span) => span.status.code === "ok")
          ? "ok"
          : "unset",
    spanCount: spans.length,
    errorSpanCount,
    services: Array.from(new Set(spans.map((span) => span.serviceName))),
  });
};

const traceGroups = (spans: ReadonlyArray<SpanRecord>) => {
  const grouped = new Map<string, Array<SpanRecord>>();
  for (const span of spans) {
    const group = grouped.get(String(span.traceId)) ?? [];
    group.push(span);
    grouped.set(String(span.traceId), group);
  }
  return grouped;
};

export const searchTraceRecords = (spans: ReadonlyArray<SpanRecord>, query: TraceSearch) =>
  Effect.gen(function* () {
    const bounds = yield* timeBounds(query.range ?? new RelativeTimeRange({ window: "1h" }));
    const cursor = yield* decodeTraceCursor(query.cursor);
    const limit = query.limit ?? 50;
    const operation = query.operation?.trim().toLowerCase();
    const summaries = Array.from(traceGroups(spans).values())
      .flatMap((traceSpans) => {
        const summary = traceSummary(traceSpans);
        if (summary === null || !within(summary.startTimeUnixNano, bounds)) return [];
        if (
          query.services !== undefined &&
          !query.services.some((service) => summary.services.includes(service))
        )
          return [];
        if (query.status !== undefined && summary.status !== query.status) return [];
        if (query.minimumDurationMs !== undefined && summary.durationMs < query.minimumDurationMs)
          return [];
        if (query.maximumDurationMs !== undefined && summary.durationMs > query.maximumDurationMs)
          return [];
        if (
          operation !== undefined &&
          !traceSpans.some((span) => span.name.toLowerCase().includes(operation))
        )
          return [];
        if (
          !traceSpans.some((span) =>
            matchesFilters(
              combinedAttributes(
                String(span.serviceName),
                span.resource.attributes,
                span.attributes,
              ),
              query.filters,
            ),
          )
        )
          return [];
        return [summary];
      })
      .filter(
        (summary) => cursor === null || compareTraceCursors(traceCursorFor(summary), cursor) < 0,
      )
      .sort((left, right) => compareTraceCursors(traceCursorFor(right), traceCursorFor(left)));
    const page = summaries.slice(0, limit);
    const hasMore = summaries.length > limit;
    const last = page.at(-1);
    return new TraceSearchPage({
      traces: page,
      nextCursor: hasMore && last !== undefined ? encodeCursor(traceCursorFor(last)) : null,
      hasMore,
      hint:
        query.cursor === undefined && summaries.length === 0
          ? "Broaden the time range or remove a filter"
          : hasMore
            ? "Continue with nextCursor for older traces"
            : null,
    });
  });

const treeNode = (
  span: SpanRecord,
  childrenByParent: ReadonlyMap<string, ReadonlyArray<SpanRecord>>,
  ancestors: ReadonlySet<string>,
  visited: Set<string>,
): TraceTreeNode => {
  visited.add(String(span.spanId));
  const nextAncestors = new Set(ancestors).add(String(span.spanId));
  return {
    span,
    children: (childrenByParent.get(String(span.spanId)) ?? [])
      .filter(
        (child) => !nextAncestors.has(String(child.spanId)) && !visited.has(String(child.spanId)),
      )
      .map((child) => treeNode(child, childrenByParent, nextAncestors, visited)),
  };
};

const serviceEdges = (spans: ReadonlyArray<SpanRecord>) => {
  const byId = new Map(spans.map((span) => [String(span.spanId), span]));
  const edges = new Map<
    string,
    {
      readonly source: SpanRecord["serviceName"];
      readonly target: SpanRecord["serviceName"];
      readonly durations: Array<number>;
      readonly errors: Array<boolean>;
    }
  >();
  for (const span of spans) {
    if (span.parentSpanId === null) continue;
    const parent = byId.get(String(span.parentSpanId));
    if (parent === undefined || parent.serviceName === span.serviceName) continue;
    const key = `${parent.serviceName}\u0000${span.serviceName}`;
    const edge = edges.get(key) ?? {
      source: parent.serviceName,
      target: span.serviceName,
      durations: [],
      errors: [],
    };
    edge.durations.push(Number(span.durationNanos) / 1_000_000);
    edge.errors.push(span.status.code === "error");
    edges.set(key, edge);
  }
  return Array.from(edges.values()).map(
    (edge) =>
      new ServiceEdge({
        source: edge.source,
        target: edge.target,
        callCount: edge.durations.length,
        errorCount: edge.errors.filter(Boolean).length,
        totalDurationMs: edge.durations.reduce((total, duration) => total + duration, 0),
      }),
  );
};

export const getTraceDetail = (
  spans: ReadonlyArray<SpanRecord>,
  logs: ReadonlyArray<LogRecord>,
  traceId: SpanRecord["traceId"],
) =>
  Effect.gen(function* () {
    const allSelected = spans
      .filter((span) => span.traceId === traceId)
      .sort((left, right) => Number(left.startTimeUnixNano - right.startTimeUnixNano));
    const selected = allSelected.slice(0, maximumTraceSpans);
    const summary = traceSummary(selected);
    if (summary === null) {
      return yield* new TraceNotFound({ traceId, message: "Trace not found" });
    }
    const byId = new Set(selected.map((span) => span.spanId));
    const childrenByParent = new Map<string, Array<SpanRecord>>();
    for (const span of selected) {
      if (span.parentSpanId === null) continue;
      const children = childrenByParent.get(String(span.parentSpanId)) ?? [];
      children.push(span);
      childrenByParent.set(String(span.parentSpanId), children);
    }
    const visited = new Set<string>();
    const roots = selected
      .filter((span) => span.parentSpanId === null || !byId.has(span.parentSpanId))
      .map((span) => treeNode(span, childrenByParent, new Set(), visited));
    const correlatedLogs = logs
      .filter((record) => record.traceId === traceId)
      .sort((left, right) => Number(left.timeUnixNano - right.timeUnixNano));
    const truncated =
      allSelected.length > maximumTraceSpans || correlatedLogs.length > maximumCorrelatedLogs;
    const complete =
      !truncated &&
      byId.size === selected.length &&
      roots.length > 0 &&
      visited.size === selected.length &&
      selected.every((span) => span.parentSpanId === null || byId.has(span.parentSpanId));
    return new TraceDetail({
      summary,
      roots,
      spans: selected,
      correlatedLogs: correlatedLogs.slice(0, maximumCorrelatedLogs),
      serviceEdges: serviceEdges(selected),
      complete,
      hint: complete
        ? null
        : truncated
          ? "This unusually large trace was truncated to protect the query service"
          : "Some parent spans are missing or the trace structure is invalid",
    });
  });
