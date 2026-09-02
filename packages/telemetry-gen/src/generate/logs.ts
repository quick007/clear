import type { ScenarioPhase, Timestamp } from "../domain/primitives.ts";
import { timestamp } from "../domain/primitives.ts";
import { LogRecord } from "../domain/telemetry.ts";
import type { Trace } from "../domain/telemetry.ts";
import type { BucketProfile } from "../profile.ts";

const traceContext = (traces: ReadonlyArray<Trace>) => {
  const trace = traces[0];
  const root = trace?.spans.find(
    (span) => span.service === "checkout-api" && span.kind === "server",
  );
  const attempts = trace?.spans.filter(
    (span) =>
      span.service === "checkout-api" &&
      span.kind === "client" &&
      typeof span.attributes.attempt === "number",
  );
  return {
    traceId: trace?.traceId ?? null,
    spanId: root?.spanId ?? null,
    startTime: root?.startTime ?? null,
    endTime: root?.endTime ?? null,
    attempts: attempts ?? [],
  };
};

export const generateLogs = (
  phase: ScenarioPhase,
  phaseBucket: number,
  bucketStart: Timestamp,
  profile: BucketProfile,
  traces: ReadonlyArray<Trace>,
) => {
  const context = traceContext(traces);
  const traceStart = context.startTime ?? bucketStart;
  const traceDuration =
    context.endTime === null ? Number.POSITIVE_INFINITY : context.endTime - traceStart;
  const at = (offset: number) =>
    timestamp(traceStart + Math.min(offset, Math.max(0, traceDuration - 1)));
  const attempt = (number: number) =>
    context.attempts.find((span) => span.attributes.attempt === number);
  const attemptStartedAt = (number: number, fallbackOffset: number) =>
    attempt(number)?.startTime ?? at(fallbackOffset);
  const attemptFinishedAt = (number: number, fallbackOffset: number) =>
    attempt(number)?.endTime ?? at(fallbackOffset);
  const traceFinishedAt = () =>
    context.endTime === null ? at(620) : timestamp(context.endTime - 1);
  const traceDurationMs = () =>
    context.endTime === null || context.startTime === null
      ? Math.round(profile.latencyP95Ms)
      : context.endTime - context.startTime;
  const log = (
    occurredAt: Timestamp,
    severity: "debug" | "info" | "warn" | "error",
    body: string,
    attributes: Readonly<Record<string, string | number | boolean>>,
  ) =>
    new LogRecord({
      timestamp: occurredAt,
      severity,
      service: "checkout-api",
      body,
      traceId: context.traceId,
      spanId: context.spanId,
      attributes,
    });

  switch (phase) {
    case "P0":
      return phaseBucket % 3 === 0
        ? [
            log(traceFinishedAt(), "info", "Checkout request completed", {
              route: "/checkout",
              "http.response.status_code": 200,
              "duration.ms": Math.round(profile.latencyP50Ms),
            }),
          ]
        : [];
    case "P1":
      return [
        log(attemptFinishedAt(1, 280), "warn", "Payment authorization returned unavailable", {
          upstream: "payments-stub",
          "http.response.status_code": 503,
          attempt: 1,
        }),
        log(attemptStartedAt(2, 320), "info", "Retrying payment authorization", {
          upstream: "payments-stub",
          attempt: 2,
          "retry.delay_ms": 0,
        }),
      ];
    case "P2":
      return [
        log(attemptStartedAt(2, 180), "warn", "Payment retry started immediately", {
          upstream: "payments-stub",
          attempt: 2,
          "retry.delay_ms": 0,
        }),
        log(attemptStartedAt(3, 240), "warn", "Payment retry started immediately", {
          upstream: "payments-stub",
          attempt: 3,
          "retry.delay_ms": 0,
        }),
        log(traceFinishedAt(), "error", "Checkout exhausted payment attempts", {
          upstream: "payments-stub",
          attempts: 3,
          "duration.ms": traceDurationMs(),
        }),
      ];
    case "P4":
      return phaseBucket === 0
        ? [
            log(at(160), "info", "Checkout deployment detected", {
              service: "checkout-api",
              release: "retry-policy",
            }),
            log(at(760), "info", "Payment retry pressure is recovering", {
              upstream: "payments-stub",
              "retry.share": Number(profile.retryShare.toFixed(4)),
            }),
          ]
        : [
            log(traceFinishedAt(), "info", "Checkout request completed", {
              route: "/checkout",
              "http.response.status_code": 200,
              "duration.ms": Math.round(profile.latencyP50Ms),
            }),
          ];
  }
};
