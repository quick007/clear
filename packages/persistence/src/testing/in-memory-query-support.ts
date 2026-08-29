import type { AttributeFilter, LogRecord, MetricQuery, TraceSummary } from "@groundtruth/telemetry";
import { LogSearchPage } from "@groundtruth/telemetry";
import { DateTime, Effect } from "effect";
import type { TelemetryRepositoryShape } from "../clickhouse/telemetry-repository.ts";
import {
  decodeLogCursor,
  decodeTraceCursor,
  encodeLogCursor,
  encodeTraceCursor,
  type LogCursorValue,
  type TraceCursorValue,
} from "../clickhouse/sql.ts";

export const valueText = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return String(value);
  return (
    JSON.stringify(value, (_, entry: unknown) =>
      typeof entry === "bigint" ? String(entry) : entry,
    ) ?? String(value)
  );
};

export const recordQueryAttributes = (record: {
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly resource: { readonly attributes: Readonly<Record<string, unknown>> };
  readonly serviceName: string;
}): Readonly<Record<string, unknown>> => ({
  ...record.resource.attributes,
  ...record.attributes,
  "service.name": record.serviceName,
});

export const matchesFilters = (
  attributes: Readonly<Record<string, unknown>>,
  filters: ReadonlyArray<AttributeFilter>,
) =>
  filters.every((filter) => {
    const present = Object.hasOwn(attributes, filter.key);
    const actual = attributes[filter.key];
    if (filter.operator === "exists") return present;
    if (filter.operator === "not-equals") {
      return !present || valueText(actual) !== valueText(filter.value);
    }
    if (!present) return false;
    if (filter.operator === "equals") return valueText(actual) === valueText(filter.value);
    return valueText(actual).toLowerCase().includes(valueText(filter.value).toLowerCase());
  });

const relativeMillis = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "3h": 3 * 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000, // 7 days
} as const;

export const inRange = (
  unixNano: bigint,
  range: MetricQuery["range"] | undefined,
  nowMillis: number,
) => {
  if (range === undefined) return true;
  const millis = Number(unixNano / 1_000_000n);
  if (range._tag === "absolute") {
    return (
      millis >= DateTime.toEpochMillis(range.start) && millis <= DateTime.toEpochMillis(range.end)
    );
  }
  return millis >= nowMillis - relativeMillis[range.window] && millis <= nowMillis;
};

export const relativeWindowMillis = (window: keyof typeof relativeMillis) => relativeMillis[window];

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const compareDecimal = (left: string, right: string) =>
  BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0;
const hashText = (value: string) => {
  let hash = 14_695_981_039_346_656_037n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
  }
  return String(hash);
};
const memoryBatchId = "00000000-0000-0000-0000-000000000000";
const logCursorFor = (record: LogRecord, logOrdinal: number): Omit<LogCursorValue, "_tag"> => ({
  timeUnixNano: String(record.timeUnixNano),
  observedTimeUnixNano: String(record.observedTimeUnixNano),
  traceId: String(record.traceId ?? ""),
  spanId: String(record.spanId ?? ""),
  serviceName: String(record.serviceName),
  bodyHash: hashText(valueText(record.body)),
  batchId: memoryBatchId,
  logOrdinal: String(logOrdinal),
});
const compareLogCursors = (left: Omit<LogCursorValue, "_tag">, right: LogCursorValue) =>
  compareDecimal(left.timeUnixNano, right.timeUnixNano) ||
  compareDecimal(left.observedTimeUnixNano, right.observedTimeUnixNano) ||
  compareText(left.traceId, right.traceId) ||
  compareText(left.spanId, right.spanId) ||
  compareText(left.serviceName, right.serviceName) ||
  compareDecimal(left.bodyHash, right.bodyHash) ||
  compareText(left.batchId, right.batchId) ||
  compareDecimal(left.logOrdinal, right.logOrdinal);

export const traceCursorFor = (summary: TraceSummary): Omit<TraceCursorValue, "_tag"> => ({
  startTimeUnixNano: String(summary.startTimeUnixNano),
  traceId: String(summary.traceId),
});
export const compareTraceCursors = (
  left: Omit<TraceCursorValue, "_tag">,
  right: TraceCursorValue,
) =>
  compareDecimal(left.startTimeUnixNano, right.startTimeUnixNano) ||
  compareText(left.traceId, right.traceId);
export const decodeTracePageCursor = decodeTraceCursor;
export const encodeTracePageCursor = encodeTraceCursor;

export const searchLogs = (
  logs: ReadonlyArray<LogRecord>,
  search: Parameters<TelemetryRepositoryShape["searchLogs"]>[1],
  nowMillis: number,
) =>
  Effect.gen(function* () {
    const cursor = search.cursor === undefined ? null : yield* decodeLogCursor(search.cursor);
    const query = search.query?.toLowerCase();
    const filtered = logs
      .map((record, ordinal) => ({ record, ordinal }))
      .filter(
        ({ record: log }) =>
          (search.services === undefined || search.services.includes(log.serviceName)) &&
          (search.severities === undefined || search.severities.includes(log.severity)) &&
          (query === undefined || valueText(log.body).toLowerCase().includes(query)) &&
          (search.traceId === undefined || log.traceId === search.traceId) &&
          (search.spanId === undefined || log.spanId === search.spanId) &&
          inRange(log.timeUnixNano, search.range, nowMillis) &&
          matchesFilters(recordQueryAttributes(log), search.filters ?? []),
      )
      .filter(
        ({ record, ordinal }) =>
          cursor === null || compareLogCursors(logCursorFor(record, ordinal), cursor) < 0,
      )
      .sort((left, right) =>
        compareLogCursors(logCursorFor(right.record, right.ordinal), {
          _tag: "logs",
          ...logCursorFor(left.record, left.ordinal),
        }),
      );
    const limit = search.limit ?? 100;
    const page = filtered.slice(0, limit);
    const records = page.map(({ record }) => record);
    const hasMore = filtered.length > limit;
    const last = page.at(-1);
    return new LogSearchPage({
      records,
      hasMore,
      nextCursor:
        hasMore && last !== undefined
          ? encodeLogCursor(logCursorFor(last.record, last.ordinal))
          : null,
      hint: hasMore ? "Continue with nextCursor for older log records." : null,
    });
  });
