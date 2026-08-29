import type { ScenarioPhase, Timestamp } from "../domain/primitives.ts";
import { timestamp } from "../domain/primitives.ts";
import { LogRecord } from "../domain/telemetry.ts";
import type { Trace } from "../domain/telemetry.ts";
import type { BucketProfile } from "../profile.ts";

const traceLink = (traces: ReadonlyArray<Trace>) => {
  const trace = traces[0];
  const root = trace?.spans.find(
    (span) => span.service === "checkout-api" && span.kind === "server",
  );
  return {
    traceId: trace?.traceId ?? null,
    spanId: root?.spanId ?? null,
  };
};

export const generateLogs = (
  phase: ScenarioPhase,
  phaseBucket: number,
  bucketStart: Timestamp,
  profile: BucketProfile,
  traces: ReadonlyArray<Trace>,
) => {
  const link = traceLink(traces);
  const at = (offset: number) => timestamp(bucketStart + offset);
  const log = (
    offset: number,
    severity: "debug" | "info" | "warn" | "error",
    body: string,
    attributes: Readonly<Record<string, string | number | boolean>>,
  ) =>
    new LogRecord({
      timestamp: at(offset),
      severity,
      service: "checkout-api",
      body,
      ...link,
      attributes,
    });

  switch (phase) {
    case "P0":
      return phaseBucket % 3 === 0
        ? [
            log(400, "info", "Checkout request completed", {
              route: "/checkout",
              "http.response.status_code": 200,
              "duration.ms": Math.round(profile.latencyP50Ms),
            }),
          ]
        : [];
    case "P1":
      return [
        log(280, "warn", "Payment authorization returned unavailable", {
          upstream: "payments-stub",
          "http.response.status_code": 503,
          attempt: 1,
        }),
        log(320, "info", "Retrying payment authorization", {
          upstream: "payments-stub",
          attempt: 2,
          "retry.delay_ms": 0,
        }),
      ];
    case "P2":
      return [
        log(180, "warn", "Payment retry started immediately", {
          upstream: "payments-stub",
          attempt: 2,
          "retry.delay_ms": 0,
        }),
        log(240, "warn", "Payment retry started immediately", {
          upstream: "payments-stub",
          attempt: 3,
          "retry.delay_ms": 0,
        }),
        log(620, "error", "Checkout exhausted payment attempts", {
          upstream: "payments-stub",
          attempts: 3,
          "duration.ms": Math.round(profile.latencyP95Ms),
        }),
      ];
    case "P4":
      return phaseBucket === 0
        ? [
            log(160, "info", "Checkout deployment detected", {
              service: "checkout-api",
              release: "retry-policy",
            }),
            log(760, "info", "Payment retry pressure is recovering", {
              upstream: "payments-stub",
              "retry.share": Number(profile.retryShare.toFixed(4)),
            }),
          ]
        : [
            log(520, "info", "Checkout request completed", {
              route: "/checkout",
              "http.response.status_code": 200,
              "duration.ms": Math.round(profile.latencyP50Ms),
            }),
          ];
  }
};
