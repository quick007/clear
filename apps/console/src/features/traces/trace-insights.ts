import { TelemetryInteger, type SpanRecord, type TelemetryValue } from "@groundtruth/telemetry";
import { Schema } from "effect";

type TraceSpanAttributes = Pick<SpanRecord, "attributes">;
const isTelemetryInteger = Schema.is(TelemetryInteger);

const naturalNumber = (value: TelemetryValue | undefined) => {
  const candidate = isTelemetryInteger(value)
    ? Number(value.value)
    : typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : null;

  return candidate !== null && Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : null;
};

export const retryAttemptCount = (spans: ReadonlyArray<TraceSpanAttributes>) => {
  let explicitRetryCount = 0;
  let greatestAttempt = 1;

  for (const span of spans) {
    explicitRetryCount = Math.max(
      explicitRetryCount,
      naturalNumber(span.attributes["retry.count"]) ?? 0,
    );
    greatestAttempt = Math.max(greatestAttempt, naturalNumber(span.attributes.attempt) ?? 1);
  }

  return Math.max(explicitRetryCount, greatestAttempt - 1);
};
