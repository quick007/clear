import { Schema } from "effect";

export const ScenarioDuration = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: 3_600_000 }),
);
export const ScenarioRate = Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 500 }));
export const ScenarioUserCount = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: 100_000 }),
);
export const FailureRate = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));

export const ScenarioPhase = Schema.Literals([
  "idle",
  "baseline",
  "blip",
  "amplification",
  "recovery",
  "stopped",
  "completed",
]);

export type ScenarioPhase = typeof ScenarioPhase.Type;

export const ScenarioStatus = Schema.Literals(["idle", "running", "stopped", "completed"]);

export type ScenarioStatus = typeof ScenarioStatus.Type;

export const ScenarioStart = Schema.Struct({
  baselineDurationMs: Schema.optionalKey(ScenarioDuration),
  blipDurationMs: Schema.optionalKey(ScenarioDuration),
  incidentFailureRate: Schema.optionalKey(FailureRate),
  maxDurationMs: Schema.optionalKey(ScenarioDuration),
  rateRps: Schema.optionalKey(ScenarioRate),
  seed: Schema.optionalKey(Schema.NonEmptyString),
  uniqueUsers: Schema.optionalKey(ScenarioUserCount),
});

export type ScenarioStart = typeof ScenarioStart.Type;

export const ScenarioTransition = Schema.Struct({
  at: Schema.Number,
  elapsedMs: Schema.Number,
  phase: ScenarioPhase,
});

export type ScenarioTransition = typeof ScenarioTransition.Type;

export const ScenarioState = Schema.Struct({
  baselineDurationMs: ScenarioDuration,
  blipDurationMs: ScenarioDuration,
  controlError: Schema.optionalKey(Schema.String),
  failedRequests: Schema.Natural,
  incidentFailureRate: FailureRate,
  lastRequestError: Schema.optionalKey(Schema.String),
  maxDurationMs: ScenarioDuration,
  phase: ScenarioPhase,
  rateRps: ScenarioRate,
  requested: Schema.Natural,
  runId: Schema.NonEmptyString,
  seed: Schema.NonEmptyString,
  startedAt: Schema.Number,
  status: ScenarioStatus,
  successfulRequests: Schema.Natural,
  transitions: Schema.Array(ScenarioTransition),
  uniqueUsers: ScenarioUserCount,
});

export type ScenarioState = typeof ScenarioState.Type;

export const CheckoutRequest = Schema.Struct({
  amountCents: Schema.Int.check(Schema.isGreaterThan(0)),
  itemCount: Schema.Int.check(Schema.isGreaterThan(0)),
  requestId: Schema.NonEmptyString,
  userId: Schema.NonEmptyString,
});

export type CheckoutRequest = typeof CheckoutRequest.Type;

export const FailureRateUpdate = Schema.Struct({
  failureRate: FailureRate,
  seed: Schema.optionalKey(Schema.NonEmptyString),
});
