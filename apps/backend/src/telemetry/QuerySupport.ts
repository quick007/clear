import { InvalidCursor } from "@groundtruth/domain";
import {
  Cursor,
  type AttributeFilter,
  type TelemetryAttributes,
  TelemetryBytes,
  TelemetryInteger,
  type TelemetryValue,
  type TimeRange,
} from "@groundtruth/telemetry";
import { DateTime, Effect } from "effect";

const windows = {
  "5m": 5 * 60 * 1_000,
  "15m": 15 * 60 * 1_000,
  "1h": 60 * 60 * 1_000,
  "3h": 3 * 60 * 60 * 1_000,
  "6h": 6 * 60 * 60 * 1_000,
  "12h": 12 * 60 * 60 * 1_000,
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000, // 7 days
} as const;

export const timeBounds = (range: TimeRange | undefined) =>
  Effect.gen(function* () {
    const now = yield* DateTime.nowAsDate;
    if (range === undefined) return { start: 0, end: now.getTime() };
    if (range._tag === "relative") {
      return { start: now.getTime() - windows[range.window], end: now.getTime() };
    }
    return {
      start: DateTime.toEpochMillis(range.start),
      end: DateTime.toEpochMillis(range.end),
    };
  });

export const nanosToMillis = (value: bigint) => Number(value / 1_000_000n);

const comparable = (value: TelemetryValue): unknown => {
  if (value instanceof TelemetryBytes) return Buffer.from(value.value).toString("base64");
  if (value instanceof TelemetryInteger) {
    const number = Number(value.value);
    return Number.isSafeInteger(number) ? number : String(value.value);
  }
  if (Array.isArray(value)) return value.map(comparable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, comparable(item)]),
    );
  }
  return value;
};

export const renderValue = (value: TelemetryValue) => {
  const normalized = comparable(value);
  return typeof normalized === "string" ? normalized : JSON.stringify(normalized);
};

const equals = (left: TelemetryValue, right: AttributeFilter["value"]) =>
  JSON.stringify(comparable(left)) === JSON.stringify(right);

export const matchesFilters = (
  values: TelemetryAttributes,
  filters: ReadonlyArray<AttributeFilter> | undefined,
) =>
  (filters ?? []).every((filter) => {
    const value = values[String(filter.key)];
    if (filter.operator === "exists") return value !== undefined;
    if (filter.operator === "not-equals") {
      return value === undefined || !equals(value, filter.value);
    }
    if (value === undefined) return false;
    if (filter.operator === "equals") return equals(value, filter.value);
    return (
      filter.value !== null &&
      renderValue(value).toLowerCase().includes(renderValue(filter.value).toLowerCase())
    );
  });

export const combinedAttributes = (
  serviceName: string,
  resource: TelemetryAttributes,
  attributes: TelemetryAttributes,
): TelemetryAttributes => ({
  ...resource,
  ...attributes,
  "service.name": serviceName,
});

export const encodeCursor = (value: object) =>
  Cursor.make(Buffer.from(JSON.stringify(value), "utf8").toString("base64url"));

export const decodeCursor = (cursor: Cursor) =>
  Effect.try({
    try: (): unknown => JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8")),
    catch: () =>
      new InvalidCursor({
        rawCursor: cursor,
        message: "Telemetry cursor is malformed or no longer valid",
      }),
  });
