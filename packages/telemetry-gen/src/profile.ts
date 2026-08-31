import { Schema } from "effect";

import type { ScenarioPhase } from "./domain/primitives.ts";
import type { RecoveryOrigin, ScenarioConfig } from "./domain/scenario.ts";
import { jitter } from "./random.ts";

export class BucketProfile extends Schema.Class<BucketProfile>("BucketProfile")({
  initialRequests: Schema.Natural,
  retryRequests: Schema.Natural,
  upstreamErrorRate: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  latencyP50Ms: Schema.Finite.check(Schema.isGreaterThan(0)),
  latencyP95Ms: Schema.Finite.check(Schema.isGreaterThan(0)),
  latencyP99Ms: Schema.Finite.check(Schema.isGreaterThan(0)),
  activeUsers: Schema.Int.check(Schema.isGreaterThan(0)),
  replicas: Schema.Int.check(Schema.isGreaterThan(0)),
}) {
  get totalUpstreamRequests() {
    return this.initialRequests + this.retryRequests;
  }

  get retryShare() {
    return this.retryRequests / this.totalUpstreamRequests;
  }
}

const recoveryFraction = (phaseBucket: number) => Math.exp(-phaseBucket / 3.5);
const amplificationFraction = (phaseBucket: number) => 1 - Math.exp(-(phaseBucket + 1) / 3.2);

const retryMultiplier = (
  phase: ScenarioPhase,
  phaseBucket: number,
  recoveryOrigin: RecoveryOrigin | null,
): number => {
  switch (phase) {
    case "P0":
      return 0;
    case "P1":
      return Math.min(0.12, 0.025 + phaseBucket * 0.02);
    case "P2": {
      if (phaseBucket === 0) return 0.6;
      if (phaseBucket === 1) return 1;
      return 2.1 - 0.5 * Math.exp(-(phaseBucket - 2) / 1.2);
    }
    case "P4": {
      const startingMultiplier =
        recoveryOrigin === null
          ? 2
          : retryMultiplier(recoveryOrigin.phase, recoveryOrigin.phaseBucket, null);
      return startingMultiplier * 0.95 * recoveryFraction(phaseBucket);
    }
  }
};

const upstreamErrorRate = (
  phase: ScenarioPhase,
  phaseBucket: number,
  retryShare: number,
  recoveryOrigin: RecoveryOrigin | null,
): number => {
  switch (phase) {
    case "P0":
      return 0.004;
    case "P1":
      return Math.max(0.02, retryShare);
    case "P2":
      return Math.max(retryShare, 0.08 + 0.62 * amplificationFraction(phaseBucket));
    case "P4": {
      if (recoveryOrigin === null) {
        return Math.min(0.7, Math.max(0.004, retryShare + 0.03 * recoveryFraction(phaseBucket)));
      }
      const startingMultiplier = retryMultiplier(
        recoveryOrigin.phase,
        recoveryOrigin.phaseBucket,
        null,
      );
      const startingRetryShare = startingMultiplier / (1 + startingMultiplier);
      const startingErrorRate = upstreamErrorRate(
        recoveryOrigin.phase,
        recoveryOrigin.phaseBucket,
        startingRetryShare,
        null,
      );
      return 0.004 + (startingErrorRate - 0.004) * Math.exp(-phaseBucket / 2.2);
    }
  }
};

const latencyP95 = (phase: ScenarioPhase, phaseBucket: number) => {
  switch (phase) {
    case "P0":
      return 120;
    case "P1":
      return 190 + phaseBucket * 35;
    case "P2":
      return 260 + 890 * amplificationFraction(phaseBucket);
    case "P4":
      return 120 + 1_030 * recoveryFraction(phaseBucket);
  }
};

export const makeBucketProfile = (
  config: ScenarioConfig,
  phase: ScenarioPhase,
  phaseBucket: number,
  recoveryOrigin: RecoveryOrigin | null = null,
) => {
  const bucketSeconds = config.bucketDurationMs / 1_000;
  const initialRequests = Math.round(
    config.baselineRequestsPerSecond *
      bucketSeconds *
      jitter(config.seed, phaseBucket, "initial-requests", 0.035),
  );
  const retryRequests = Math.round(
    initialRequests * retryMultiplier(phase, phaseBucket, recoveryOrigin),
  );
  const retryShare = retryRequests / (initialRequests + retryRequests);
  const userCenter = Math.max(16, Math.round(config.uniqueUsersPerFiveMinutes * 0.225));
  const activeUsers = Math.min(
    initialRequests,
    Math.max(1, Math.round(userCenter * jitter(config.seed, phaseBucket, "active-users", 0.04))),
  );
  const p95 =
    phase === "P4" && recoveryOrigin !== null
      ? 120 +
        (latencyP95(recoveryOrigin.phase, recoveryOrigin.phaseBucket) *
          jitter(config.seed, recoveryOrigin.phaseBucket, `latency-${recoveryOrigin.phase}`, 0.06) -
          120) *
          0.95 *
          recoveryFraction(phaseBucket)
      : latencyP95(phase, phaseBucket) * jitter(config.seed, phaseBucket, `latency-${phase}`, 0.06);

  return new BucketProfile({
    initialRequests,
    retryRequests,
    upstreamErrorRate: upstreamErrorRate(phase, phaseBucket, retryShare, recoveryOrigin),
    latencyP50Ms: Math.max(35, p95 * 0.42),
    latencyP95Ms: p95,
    latencyP99Ms: p95 * 1.72,
    activeUsers,
    replicas: 2,
  });
};
