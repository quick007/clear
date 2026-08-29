import { Schema } from "effect";

import type { ScenarioPhase } from "./domain/primitives.ts";
import type { ScenarioConfig } from "./domain/scenario.ts";
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

const recoveryFraction = (phaseBucket: number) => Math.exp(-phaseBucket / 2.2);

const retryMultiplier = (phase: ScenarioPhase, phaseBucket: number) => {
  switch (phase) {
    case "P0":
      return 0;
    case "P1":
      return 0.02;
    case "P2":
      return 2;
    case "P4":
      return 2 * recoveryFraction(phaseBucket);
  }
};

const upstreamErrorRate = (phase: ScenarioPhase, phaseBucket: number, retryShare: number) => {
  switch (phase) {
    case "P0":
      return 0.004;
    case "P1":
      return retryShare;
    case "P2":
      return 0.7;
    case "P4":
      return Math.min(0.7, Math.max(0.004, retryShare + 0.03 * recoveryFraction(phaseBucket)));
  }
};

const latencyP95 = (phase: ScenarioPhase, phaseBucket: number) => {
  switch (phase) {
    case "P0":
      return 120;
    case "P1":
      return 240;
    case "P2":
      return 1_150;
    case "P4":
      return 120 + 1_030 * recoveryFraction(phaseBucket);
  }
};

export const makeBucketProfile = (
  config: ScenarioConfig,
  phase: ScenarioPhase,
  phaseBucket: number,
) => {
  const bucketSeconds = config.bucketDurationMs / 1_000;
  const initialRequests = Math.round(
    config.baselineRequestsPerSecond *
      bucketSeconds *
      jitter(config.seed, phaseBucket, "initial-requests", 0.035),
  );
  const retryRequests = Math.round(initialRequests * retryMultiplier(phase, phaseBucket));
  const retryShare = retryRequests / (initialRequests + retryRequests);
  const userCenter = Math.max(16, Math.round(config.uniqueUsersPerFiveMinutes * 0.225));
  const activeUsers = Math.min(
    initialRequests,
    Math.max(1, Math.round(userCenter * jitter(config.seed, phaseBucket, "active-users", 0.04))),
  );
  const p95 =
    latencyP95(phase, phaseBucket) * jitter(config.seed, phaseBucket, `latency-${phase}`, 0.06);

  return new BucketProfile({
    initialRequests,
    retryRequests,
    upstreamErrorRate: upstreamErrorRate(phase, phaseBucket, retryShare),
    latencyP50Ms: Math.max(35, p95 * 0.42),
    latencyP95Ms: p95,
    latencyP99Ms: p95 * 1.72,
    activeUsers,
    replicas: 2,
  });
};
