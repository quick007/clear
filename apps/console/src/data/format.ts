import type { TelemetryAttributes, TelemetryValue } from "@groundtruth/telemetry";
import { TelemetryBytes, TelemetryInteger } from "@groundtruth/telemetry";
import { DateTime } from "effect";

export const epochMilliseconds = (value: DateTime.Utc) => DateTime.toEpochMillis(value);

export const formatClockTime = (value: DateTime.Utc) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(DateTime.toDate(value));

export const formatShortTime = (value: DateTime.Utc) =>
  new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
    DateTime.toDate(value),
  );

export const formatEpochShortTime = (value: number) =>
  new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );

export const formatRelativeTime = (value: DateTime.Utc | null) => {
  if (value === null) return "not received";
  const seconds = Math.max(0, Math.round((Date.now() - epochMilliseconds(value)) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
};

export const formatOpenDuration = (value: DateTime.Utc) => {
  const minutes = Math.max(1, Math.floor((Date.now() - epochMilliseconds(value)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60} min`;
};

export const formatDuration = (milliseconds: number) =>
  milliseconds >= 1_000
    ? `${(milliseconds / 1_000).toFixed(milliseconds >= 10_000 ? 1 : 2)} s`
    : `${Math.round(milliseconds)} ms`;

export const telemetryValueText = (value: TelemetryValue): string => {
  if (value === null) return "null";
  if (value instanceof TelemetryInteger) return String(value.value);
  if (value instanceof TelemetryBytes) return "binary value";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(telemetryValueText).join(", ");
  return JSON.stringify(value);
};

export const logBodyText = (value: TelemetryValue) => telemetryValueText(value);

export const attributesText = (attributes: TelemetryAttributes) =>
  Object.entries(attributes)
    .slice(0, 4)
    .map(([key, value]) => `${key}=${telemetryValueText(value)}`)
    .join(" ");

export const unixNanoToDate = (value: bigint) => new Date(Number(value / 1_000_000n));

export const formatUnixNanoTime = (value: bigint) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  }).format(unixNanoToDate(value));

export const errorMessage = (error: unknown) => {
  if (!(error instanceof Error)) return "Clear could not load this data";
  if (/transport error|failed to fetch|fetch failed/iu.test(error.message)) {
    return "Clear could not reach the API. Check the connection and try again.";
  }
  return error.message;
};
