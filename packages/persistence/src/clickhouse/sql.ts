import type { ProjectId } from "@groundtruth/domain";
import { InvalidCursor } from "@groundtruth/domain";
import { type AttributeFilter, Cursor, type TimeRange } from "@groundtruth/telemetry";
import { DateTime, Effect, Schema } from "effect";

type QueryParameters = Record<string, unknown>;

export interface SqlPlan {
  readonly where: string;
  readonly parameters: QueryParameters;
}

const relativeIntervals = {
  "5m": "5 MINUTE",
  "15m": "15 MINUTE",
  "1h": "1 HOUR",
  "3h": "3 HOUR",
  "6h": "6 HOUR",
  "12h": "12 HOUR",
  "24h": "24 HOUR",
  "7d": "7 DAY",
} as const;

export const formatDateTime64 = (value: DateTime.Utc) =>
  DateTime.toDateUtc(value).toISOString().replace("T", " ").replace("Z", "000000");

export const timeRangePlan = (
  range: TimeRange,
  column: "time_unix_nano" | "start_time_unix_nano",
  prefix: string,
): SqlPlan => {
  if (range._tag === "relative") {
    return {
      where: `${column} >= toUnixTimestamp64Nano(now64(9) - INTERVAL ${relativeIntervals[range.window]})`,
      parameters: {},
    };
  }
  return {
    where: `${column} >= toUnixTimestamp64Nano({${prefix}Start:DateTime64(9, 'UTC')}) AND ${column} <= toUnixTimestamp64Nano({${prefix}End:DateTime64(9, 'UTC')})`,
    parameters: {
      [`${prefix}Start`]: formatDateTime64(range.start),
      [`${prefix}End`]: formatDateTime64(range.end),
    },
  };
};

const filterValue = (value: AttributeFilter["value"]) => {
  if (value === null) return "";
  return Array.isArray(value) ? JSON.stringify(value) : String(value);
};

export const attributeFiltersPlan = (
  filters: ReadonlyArray<AttributeFilter>,
  mapColumn: "attributes" | "resource_attributes" | "scope_attributes",
  prefix: string,
): SqlPlan => {
  const parameters: QueryParameters = {};
  const clauses = filters.map((filter, index) => {
    const keyParameter = `${prefix}Key${index}`;
    const valueParameter = `${prefix}Value${index}`;
    parameters[keyParameter] = filter.key;
    parameters[valueParameter] = filterValue(filter.value);
    const access = `${mapColumn}[{${keyParameter}:String}]`;
    const contains = `mapContains(${mapColumn}, {${keyParameter}:String})`;

    switch (filter.operator) {
      case "equals":
        return `(${contains} AND ${access} = {${valueParameter}:String})`;
      case "not-equals":
        return `(NOT ${contains} OR ${access} != {${valueParameter}:String})`;
      case "contains":
        return `(${contains} AND positionCaseInsensitiveUTF8(${access}, {${valueParameter}:String}) > 0)`;
      case "exists":
        return contains;
    }
  });
  return { where: clauses.length === 0 ? "1" : clauses.join(" AND "), parameters };
};

export const projectParameters = (projectId: ProjectId): QueryParameters => ({ projectId });

export interface LogCursorValue {
  readonly _tag: "logs";
  readonly timeUnixNano: string;
  readonly observedTimeUnixNano: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly serviceName: string;
  readonly bodyHash: string;
  readonly batchId: string;
  readonly logOrdinal: string;
}

export interface TraceCursorValue {
  readonly _tag: "traces";
  readonly startTimeUnixNano: string;
  readonly traceId: string;
}

const encodeCursor = (value: object) =>
  Schema.decodeSync(Cursor)(Buffer.from(JSON.stringify(value)).toString("base64url"));

const decimal = Schema.String.check(Schema.isPattern(/^(?:0|[1-9][0-9]*)$/));
const LogCursorSchema = Schema.Struct({
  _tag: Schema.Literals(["logs"]),
  timeUnixNano: decimal,
  observedTimeUnixNano: decimal,
  traceId: Schema.String,
  spanId: Schema.String,
  serviceName: Schema.String,
  bodyHash: decimal,
  batchId: Schema.String.check(Schema.isPattern(/^[0-9a-f-]{36}$/)),
  logOrdinal: decimal,
});
const TraceCursorSchema = Schema.Struct({
  _tag: Schema.Literals(["traces"]),
  startTimeUnixNano: decimal,
  traceId: Schema.String,
});

const invalidCursor = (cursor: Cursor) =>
  new InvalidCursor({
    rawCursor: cursor,
    message: "Telemetry cursor is malformed or no longer valid",
  });

const parseCursor = (cursor: Cursor) =>
  Effect.try({
    try: (): unknown => JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    catch: () => invalidCursor(cursor),
  });

export const encodeLogCursor = (value: Omit<LogCursorValue, "_tag">) =>
  encodeCursor({ _tag: "logs", ...value });
export const decodeLogCursor = (cursor: Cursor) =>
  parseCursor(cursor).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(LogCursorSchema)),
    Effect.mapError(() => invalidCursor(cursor)),
  );

export const encodeTraceCursor = (value: Omit<TraceCursorValue, "_tag">) =>
  encodeCursor({ _tag: "traces", ...value });
export const decodeTraceCursor = (cursor: Cursor) =>
  parseCursor(cursor).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(TraceCursorSchema)),
    Effect.mapError(() => invalidCursor(cursor)),
  );

export const severityNameSql = `multiIf(
  severity_number = 0, 'unspecified',
  severity_number <= 4, 'trace',
  severity_number <= 8, 'debug',
  severity_number <= 12, 'info',
  severity_number <= 16, 'warn',
  severity_number <= 20, 'error',
  'fatal'
)`;

export const aggregationExpression = (
  aggregation: string,
  bucketSeconds: number,
  distinctValue = "''",
  distinctCondition = "1",
) => {
  const value = `multiIf(
    value_type = 'int', toFloat64(int_value),
    value_type = 'double', double_value,
    count > 0 AND has_sum, sum / count,
    0
  )`;
  const total = "if(value_type = 'none' AND has_sum, sum, " + value + ")";
  switch (aggregation) {
    case "sum":
      return `sum(${total})`;
    case "avg":
      return `if(sum(if(value_type = 'none', count, 1)) = 0, 0, sum(${total}) / sum(if(value_type = 'none', count, 1)))`;
    case "min":
      return `min(if(value_type = 'none' AND has_min, min, ${value}))`;
    case "max":
      return `max(if(value_type = 'none' AND has_max, max, ${value}))`;
    case "count":
      return "toFloat64(sum(if(value_type = 'none', count, 1)))";
    case "rate":
      return `sum(${total}) / ${bucketSeconds}`;
    case "p50":
      return `quantileTDigest(0.5)(${value})`;
    case "p95":
      return `quantileTDigest(0.95)(${value})`;
    case "p99":
      return `quantileTDigest(0.99)(${value})`;
    case "count-distinct":
      return `toFloat64(uniqCombined64If(${distinctValue}, ${distinctCondition}))`;
    default:
      return "avg(double_value)";
  }
};
