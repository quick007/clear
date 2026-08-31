import type { ScenarioPhase, Timestamp } from "../domain/primitives.ts";
import { AlertEvent } from "../domain/telemetry.ts";
import type { BucketProfile } from "../profile.ts";

const makeAlert = (
  tag: "AlertFired" | "AlertResolved",
  alertId: string,
  name: string,
  severity: "warning" | "critical",
  metric: "http.server.requests" | "http.server.duration" | "upstream.client.requests",
  threshold: number,
  observed: number,
  timestamp: Timestamp,
) =>
  AlertEvent.cases[tag].make({
    alertId,
    name,
    severity,
    metric,
    threshold,
    observed,
    timestamp,
  });

export const generateAlerts = (
  phase: ScenarioPhase,
  phaseBucket: number,
  timestamp: Timestamp,
  profile: BucketProfile,
  previousProfile: BucketProfile | null,
  bucketDurationMs: number,
) => {
  const upstreamRequestsPerSecond = profile.totalUpstreamRequests / (bucketDurationMs / 1_000);
  const previousUpstreamRequestsPerSecond =
    previousProfile === null
      ? null
      : previousProfile.totalUpstreamRequests / (bucketDurationMs / 1_000);

  switch (phase) {
    case "P0":
      return [];
    case "P1":
      if (phaseBucket !== 0) return [];
      return [
        makeAlert(
          "AlertFired",
          "checkout-upstream-errors",
          "Payment upstream error rate",
          "warning",
          "upstream.client.requests",
          0.01,
          profile.upstreamErrorRate,
          timestamp,
        ),
      ];
    case "P2":
      return [
        ...(upstreamRequestsPerSecond >= 90 &&
        (previousUpstreamRequestsPerSecond === null || previousUpstreamRequestsPerSecond < 90)
          ? [
              makeAlert(
                "AlertFired",
                "checkout-upstream-request-rate",
                "Payment request rate",
                "critical",
                "upstream.client.requests",
                90,
                upstreamRequestsPerSecond,
                timestamp,
              ),
            ]
          : []),
        ...(profile.latencyP95Ms >= 600 &&
        (previousProfile === null || previousProfile.latencyP95Ms < 600)
          ? [
              makeAlert(
                "AlertFired",
                "checkout-latency-p95",
                "Checkout latency p95",
                "warning",
                "http.server.duration",
                600,
                profile.latencyP95Ms,
                timestamp,
              ),
            ]
          : []),
      ];
    case "P4":
      if (previousProfile === null) return [];
      const previousRecoveryRequestRate =
        previousProfile.totalUpstreamRequests / (bucketDurationMs / 1_000);
      return [
        ...(profile.upstreamErrorRate <= 0.01 && previousProfile.upstreamErrorRate > 0.01
          ? [
              makeAlert(
                "AlertResolved",
                "checkout-upstream-errors",
                "Payment upstream error rate",
                "warning",
                "upstream.client.requests",
                0.01,
                profile.upstreamErrorRate,
                timestamp,
              ),
            ]
          : []),
        ...(upstreamRequestsPerSecond < 90 && previousRecoveryRequestRate >= 90
          ? [
              makeAlert(
                "AlertResolved",
                "checkout-upstream-request-rate",
                "Payment request rate",
                "warning",
                "upstream.client.requests",
                90,
                upstreamRequestsPerSecond,
                timestamp,
              ),
            ]
          : []),
        ...(profile.latencyP95Ms <= 600 && previousProfile.latencyP95Ms > 600
          ? [
              makeAlert(
                "AlertResolved",
                "checkout-latency-p95",
                "Checkout latency p95",
                "critical",
                "http.server.duration",
                600,
                profile.latencyP95Ms,
                timestamp,
              ),
            ]
          : []),
      ];
  }
};
