import type { ClickHouseClient } from "@clickhouse/client";
import type { ProjectId } from "@groundtruth/domain";
import {
  RelativeTimeRange,
  ServiceEdge,
  SpanRecord,
  TraceDetail,
  type TraceId,
  type TraceSearch,
  TraceSearchPage,
  TraceSummary,
  type TraceTreeNode,
} from "@groundtruth/telemetry";
import { Effect, Schema } from "effect";
import { logRecordFromRow, logSelect, type LogRow } from "./log-queries.ts";
import { clickhouseAttempt } from "./operation.ts";
import {
  attributeFiltersPlan,
  decodeTraceCursor,
  encodeTraceCursor,
  projectParameters,
  timeRangePlan,
} from "./sql.ts";

const parseJson = <A>(value: string) => JSON.parse(value) as A;
const emptyToNull = (value: string) => (value === "" ? null : value);

interface TraceSummaryRow {
  readonly trace_id: string;
  readonly root_span_name: string;
  readonly root_service_name: string;
  readonly trace_start_unix_nano: string;
  readonly duration_ms: string;
  readonly status: string;
  readonly span_count: string;
  readonly error_span_count: string;
  readonly services: string;
}

const traceSummaryFromRow = (row: TraceSummaryRow) =>
  Schema.decodeUnknownSync(TraceSummary)({
    traceId: row.trace_id,
    rootSpanName: row.root_span_name,
    rootServiceName: row.root_service_name,
    startTimeUnixNano: row.trace_start_unix_nano,
    durationMs: Number(row.duration_ms),
    status: row.status,
    spanCount: Number(row.span_count),
    errorSpanCount: Number(row.error_span_count),
    services: parseJson<ReadonlyArray<string>>(row.services),
  });

export const searchTraces = (client: ClickHouseClient, projectId: ProjectId, search: TraceSearch) =>
  Effect.gen(function* () {
    const services = search.services ?? [];
    const limit = search.limit ?? 50;
    const range = timeRangePlan(
      search.range ?? new RelativeTimeRange({ window: "1h" }),
      "start_time_unix_nano",
      "trace",
    );
    const filters = attributeFiltersPlan(search.filters ?? [], "attributes", "traceFilter");
    const cursor = search.cursor === undefined ? null : yield* decodeTraceCursor(search.cursor);
    return yield* clickhouseAttempt("search traces", async (signal) => {
      const result = await client.query({
        query: `WITH matching_traces AS
      (
        SELECT trace_id
        FROM groundtruth.spans
        WHERE project_id = {projectId:UUID}
          AND ${range.where}
          AND ${filters.where}
          AND (length({services:Array(String)}) = 0 OR service_name IN {services:Array(String)})
          AND ({operation:String} = '' OR positionCaseInsensitiveUTF8(span_name, {operation:String}) > 0)
        GROUP BY trace_id
      ), summaries AS
      (
        SELECT
          trace_id,
          if(countIf(parent_span_id = '') > 0, argMinIf(span_name, start_time_unix_nano, parent_span_id = ''), argMin(span_name, start_time_unix_nano)) AS root_span_name,
          if(countIf(parent_span_id = '') > 0, argMinIf(service_name, start_time_unix_nano, parent_span_id = ''), argMin(service_name, start_time_unix_nano)) AS root_service_name,
          min(start_time_unix_nano) AS trace_start_unix_nano,
          (max(end_time_unix_nano) - min(start_time_unix_nano)) / 1000000 AS duration_ms,
          multiIf(countIf(status_code = 'error') > 0, 'error', countIf(status_code = 'ok') > 0, 'ok', 'unset') AS status,
          count() AS span_count,
          countIf(status_code = 'error') AS error_span_count,
          toJSONString(groupUniqArray(service_name)) AS services
        FROM groundtruth.spans
        WHERE project_id = {projectId:UUID} AND trace_id IN matching_traces
        GROUP BY trace_id
      )
      SELECT * FROM summaries
      WHERE ({hasCursor:UInt8} = 0 OR tuple(trace_start_unix_nano, trace_id) < tuple({cursorStart:UInt64}, {cursorTrace:String}))
        AND ({status:String} = '' OR status = {status:String})
        AND ({minimumDuration:Float64} < 0 OR duration_ms >= {minimumDuration:Float64})
        AND ({maximumDuration:Float64} < 0 OR duration_ms <= {maximumDuration:Float64})
      ORDER BY trace_start_unix_nano DESC, trace_id DESC
      LIMIT {limit:UInt32}`,
        format: "JSONStringsEachRow",
        query_params: {
          ...projectParameters(projectId),
          ...range.parameters,
          ...filters.parameters,
          services: [...services],
          operation: search.operation ?? "",
          status: search.status ?? "",
          minimumDuration: search.minimumDurationMs ?? -1,
          maximumDuration: search.maximumDurationMs ?? -1,
          hasCursor: cursor === null ? 0 : 1,
          cursorStart: cursor?.startTimeUnixNano ?? "0",
          cursorTrace: cursor?.traceId ?? "",
          limit: limit + 1,
        },
        abort_signal: signal,
      });
      const rows = await result.json<TraceSummaryRow>();
      const hasMore = rows.length > limit;
      const pageRows = rows.slice(0, limit);
      const last = pageRows.at(-1);
      return new TraceSearchPage({
        traces: pageRows.map(traceSummaryFromRow),
        nextCursor:
          hasMore && last !== undefined
            ? encodeTraceCursor({
                startTimeUnixNano: last.trace_start_unix_nano,
                traceId: last.trace_id,
              })
            : null,
        hasMore,
        hint: hasMore ? "Continue with nextCursor for older traces." : null,
      });
    });
  });

interface SpanRow {
  readonly trace_id: string;
  readonly span_id: string;
  readonly parent_span_id: string;
  readonly trace_state: string;
  readonly flags: string;
  readonly span_name: string;
  readonly span_kind: string;
  readonly start_time_unix_nano: string;
  readonly end_time_unix_nano: string;
  readonly status_code: string;
  readonly status_message: string;
  readonly service_name: string;
  readonly resource_attributes_json: string;
  readonly scope_attributes_json: string;
  readonly attributes_json: string;
  readonly dropped_attributes_count: string;
  readonly dropped_events_count: string;
  readonly dropped_links_count: string;
}

interface SpanEventRow {
  readonly span_id: string;
  readonly event_name: string;
  readonly time_unix_nano: string;
  readonly attributes_json: string;
  readonly dropped_attributes_count: string;
}

interface SpanLinkRow {
  readonly span_id: string;
  readonly linked_trace_id: string;
  readonly linked_span_id: string;
  readonly trace_state: string;
  readonly flags: string;
  readonly attributes_json: string;
  readonly dropped_attributes_count: string;
}

export const getTrace = (client: ClickHouseClient, projectId: ProjectId, traceId: TraceId) =>
  clickhouseAttempt("get trace", async (signal) => {
    const parameters = { ...projectParameters(projectId), traceId };
    const query = async <Row>(sql: string) => {
      const result = await client.query({
        query: sql,
        format: "JSONStringsEachRow",
        query_params: parameters,
        abort_signal: signal,
      });
      return result.json<Row>();
    };
    const [spanRows, eventRows, linkRows, logRows] = await Promise.all([
      query<SpanRow>(`SELECT trace_id, span_id, parent_span_id, trace_state, flags, span_name, toString(span_kind) AS span_kind,
        start_time_unix_nano, end_time_unix_nano, toString(status_code) AS status_code, status_message, service_name,
        resource_attributes_json, scope_attributes_json, attributes_json, dropped_attributes_count,
        dropped_events_count, dropped_links_count
        FROM groundtruth.spans WHERE project_id = {projectId:UUID} AND trace_id = {traceId:String}
        ORDER BY start_time_unix_nano, span_id LIMIT 5001`),
      query<SpanEventRow>(`SELECT span_id, event_name, time_unix_nano, attributes_json, dropped_attributes_count
        FROM groundtruth.span_events WHERE project_id = {projectId:UUID} AND trace_id = {traceId:String}
        ORDER BY span_id, event_index LIMIT 10001`),
      query<SpanLinkRow>(`SELECT span_id, linked_trace_id, linked_span_id, trace_state, flags, attributes_json, dropped_attributes_count
        FROM groundtruth.span_links WHERE project_id = {projectId:UUID} AND trace_id = {traceId:String}
        ORDER BY span_id, link_index LIMIT 10001`),
      query<LogRow>(`SELECT ${logSelect} FROM groundtruth.logs
        WHERE project_id = {projectId:UUID} AND trace_id = {traceId:String}
        ORDER BY time_unix_nano LIMIT 201`),
    ]);
    if (spanRows.length === 0) return null;

    const eventsBySpan = new Map<string, Array<Record<string, unknown>>>();
    for (const row of eventRows.slice(0, 10_000)) {
      const event = {
        name: row.event_name,
        timeUnixNano: row.time_unix_nano,
        attributes: JSON.parse(row.attributes_json),
        droppedAttributesCount: row.dropped_attributes_count,
      };
      eventsBySpan.set(row.span_id, [...(eventsBySpan.get(row.span_id) ?? []), event]);
    }
    const linksBySpan = new Map<string, Array<Record<string, unknown>>>();
    for (const row of linkRows.slice(0, 10_000)) {
      const link = {
        traceId: row.linked_trace_id,
        spanId: row.linked_span_id,
        traceState: row.trace_state,
        attributes: JSON.parse(row.attributes_json),
        droppedAttributesCount: row.dropped_attributes_count,
        flags: Number(row.flags),
      };
      linksBySpan.set(row.span_id, [...(linksBySpan.get(row.span_id) ?? []), link]);
    }
    const spans = spanRows.slice(0, 5_000).map((row) =>
      Schema.decodeUnknownSync(SpanRecord)({
        traceId: row.trace_id,
        spanId: row.span_id,
        parentSpanId: emptyToNull(row.parent_span_id),
        traceState: row.trace_state,
        flags: Number(row.flags),
        name: row.span_name,
        kind: row.span_kind,
        startTimeUnixNano: row.start_time_unix_nano,
        endTimeUnixNano: row.end_time_unix_nano,
        durationNanos: (
          BigInt(row.end_time_unix_nano) - BigInt(row.start_time_unix_nano)
        ).toString(),
        status: { code: row.status_code, message: row.status_message },
        attributes: JSON.parse(row.attributes_json),
        droppedAttributesCount: row.dropped_attributes_count,
        events: eventsBySpan.get(row.span_id) ?? [],
        droppedEventsCount: row.dropped_events_count,
        links: linksBySpan.get(row.span_id) ?? [],
        droppedLinksCount: row.dropped_links_count,
        resource: JSON.parse(row.resource_attributes_json),
        scope: JSON.parse(row.scope_attributes_json),
        serviceName: row.service_name,
      }),
    );
    const partial =
      spanRows.length > 5_000 || eventRows.length > 10_000 || linkRows.length > 10_000;
    return new TraceDetail({
      summary: summarizeTrace(spans),
      roots: buildTraceTree(spans),
      spans,
      correlatedLogs: logRows.slice(0, 200).map(logRecordFromRow),
      serviceEdges: buildServiceEdges(spans),
      complete: !partial && logRows.length <= 200,
      hint: partial
        ? "This unusually large trace was truncated to protect the query service."
        : null,
    });
  });

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

const summarizeTrace = (spans: ReadonlyArray<SpanRecord>) => {
  const root = spans.find(({ parentSpanId }) => parentSpanId === null) ?? spans[0];
  if (root === undefined) throw new Error("Cannot summarize an empty trace");
  const start = spans.reduce(
    (minimum, span) => (span.startTimeUnixNano < minimum ? span.startTimeUnixNano : minimum),
    root.startTimeUnixNano,
  );
  const end = spans.reduce(
    (maximum, span) => (span.endTimeUnixNano > maximum ? span.endTimeUnixNano : maximum),
    root.endTimeUnixNano,
  );
  const errorSpanCount = spans.filter(({ status }) => status.code === "error").length;
  const status =
    errorSpanCount > 0
      ? "error"
      : spans.some(({ status }) => status.code === "ok")
        ? "ok"
        : "unset";
  return new TraceSummary({
    traceId: root.traceId,
    rootSpanName: root.name,
    rootServiceName: root.serviceName,
    startTimeUnixNano: start,
    durationMs: Number(end - start) / 1_000_000,
    status,
    spanCount: spans.length,
    errorSpanCount,
    services: [...new Set(spans.map(({ serviceName }) => serviceName))],
  });
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
    const current = edges.get(key) ?? {
      source: parent.serviceName,
      target: span.serviceName,
      callCount: 0,
      errorCount: 0,
      totalDurationMs: 0,
    };
    current.callCount += 1;
    current.errorCount += span.status.code === "error" ? 1 : 0;
    current.totalDurationMs += Number(span.durationNanos) / 1_000_000;
    edges.set(key, current);
  }
  return [...edges.values()].map((edge) => new ServiceEdge(edge));
};
