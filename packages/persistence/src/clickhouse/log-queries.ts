import type { ClickHouseClient } from "@clickhouse/client";
import type { ProjectId } from "@groundtruth/domain";
import {
  LogRecord,
  type LogSearch,
  LogSearchPage,
  RelativeTimeRange,
} from "@groundtruth/telemetry";
import { Effect, Schema } from "effect";
import { clickhouseAttempt } from "./operation.ts";
import {
  attributeFiltersPlan,
  decodeLogCursor,
  encodeLogCursor,
  projectParameters,
  severityNameSql,
  timeRangePlan,
} from "./sql.ts";

const emptyToNull = (value: string) => (value === "" ? null : value);

export interface LogRow {
  readonly batch_id: string;
  readonly log_ordinal: string;
  readonly time_unix_nano: string;
  readonly observed_time_unix_nano: string;
  readonly trace_id: string;
  readonly span_id: string;
  readonly flags: string;
  readonly severity_number: string;
  readonly severity_text: string;
  readonly severity: string;
  readonly event_name: string;
  readonly body_json: string;
  readonly service_name: string;
  readonly resource_attributes_json: string;
  readonly scope_attributes_json: string;
  readonly attributes_json: string;
  readonly dropped_attributes_count: string;
  readonly body_hash: string;
}

export const logRecordFromRow = (row: LogRow) =>
  Schema.decodeUnknownSync(LogRecord)({
    timeUnixNano: row.time_unix_nano,
    observedTimeUnixNano: row.observed_time_unix_nano,
    traceId: emptyToNull(row.trace_id),
    spanId: emptyToNull(row.span_id),
    flags: Number(row.flags),
    severity: row.severity,
    severityNumber: Number(row.severity_number),
    severityText: emptyToNull(row.severity_text),
    body: JSON.parse(row.body_json),
    eventName: emptyToNull(row.event_name),
    attributes: JSON.parse(row.attributes_json),
    droppedAttributesCount: row.dropped_attributes_count,
    resource: JSON.parse(row.resource_attributes_json),
    scope: JSON.parse(row.scope_attributes_json),
    serviceName: row.service_name,
  });

export const logSelect = `toString(batch_id) AS batch_id, log_ordinal, time_unix_nano, observed_time_unix_nano, trace_id, span_id, flags,
  severity_number, severity_text, ${severityNameSql} AS severity, event_name, body_json,
  service_name, resource_attributes_json, scope_attributes_json, attributes_json,
  dropped_attributes_count, toString(cityHash64(body_json)) AS body_hash`;

export const searchLogs = (client: ClickHouseClient, projectId: ProjectId, search: LogSearch) =>
  Effect.gen(function* () {
    const services = search.services ?? [];
    const severities = search.severities ?? [];
    const limit = search.limit ?? 100;
    const range = timeRangePlan(
      search.range ?? new RelativeTimeRange({ window: "15m" }),
      "time_unix_nano",
      "log",
    );
    const filters = attributeFiltersPlan(search.filters ?? [], "attributes", "logFilter");
    const cursor = search.cursor === undefined ? null : yield* decodeLogCursor(search.cursor);
    return yield* clickhouseAttempt("search logs", async (signal) => {
      const result = await client.query({
        query: `SELECT ${logSelect}
      FROM groundtruth.logs
      WHERE project_id = {projectId:UUID}
        AND ${range.where}
        AND ${filters.where}
        AND (length({services:Array(String)}) = 0 OR service_name IN {services:Array(String)})
        AND (length({severities:Array(String)}) = 0 OR severity IN {severities:Array(String)})
        AND ({textQuery:String} = '' OR positionCaseInsensitiveUTF8(body, {textQuery:String}) > 0)
        AND ({traceId:String} = '' OR trace_id = {traceId:String})
        AND ({spanId:String} = '' OR span_id = {spanId:String})
        AND ({hasCursor:UInt8} = 0 OR tuple(time_unix_nano, observed_time_unix_nano, trace_id, span_id, service_name, cityHash64(body_json), toString(batch_id), log_ordinal) < tuple(
          {cursorTime:UInt64}, {cursorObserved:UInt64}, {cursorTrace:String}, {cursorSpan:String}, {cursorService:String}, {cursorBodyHash:UInt64}, {cursorBatch:String}, {cursorOrdinal:UInt32}
        ))
      ORDER BY time_unix_nano DESC, observed_time_unix_nano DESC, trace_id DESC, span_id DESC, service_name DESC, cityHash64(body_json) DESC, toString(batch_id) DESC, log_ordinal DESC
      LIMIT {limit:UInt32}`,
        format: "JSONStringsEachRow",
        query_params: {
          ...projectParameters(projectId),
          ...range.parameters,
          ...filters.parameters,
          services: [...services],
          severities: [...severities],
          textQuery: search.query ?? "",
          traceId: search.traceId ?? "",
          spanId: search.spanId ?? "",
          hasCursor: cursor === null ? 0 : 1,
          cursorTime: cursor?.timeUnixNano ?? "0",
          cursorObserved: cursor?.observedTimeUnixNano ?? "0",
          cursorTrace: cursor?.traceId ?? "",
          cursorSpan: cursor?.spanId ?? "",
          cursorService: cursor?.serviceName ?? "",
          cursorBodyHash: cursor?.bodyHash ?? "0",
          cursorBatch: cursor?.batchId ?? "00000000-0000-0000-0000-000000000000",
          cursorOrdinal: cursor?.logOrdinal ?? "0",
          limit: limit + 1,
        },
        abort_signal: signal,
      });
      const rows = await result.json<LogRow>();
      const hasMore = rows.length > limit;
      const pageRows = rows.slice(0, limit);
      const last = pageRows.at(-1);
      return new LogSearchPage({
        records: pageRows.map(logRecordFromRow),
        nextCursor:
          hasMore && last !== undefined
            ? encodeLogCursor({
                timeUnixNano: last.time_unix_nano,
                observedTimeUnixNano: last.observed_time_unix_nano,
                traceId: last.trace_id,
                spanId: last.span_id,
                serviceName: last.service_name,
                bodyHash: last.body_hash,
                batchId: last.batch_id,
                logOrdinal: last.log_ordinal,
              })
            : null,
        hasMore,
        hint: hasMore ? "Continue with nextCursor for older log records." : null,
      });
    });
  });
