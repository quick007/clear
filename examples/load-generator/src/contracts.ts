import { Schema } from "effect";

const Positive = Schema.Finite.check(Schema.isGreaterThan(0));
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

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
  baselineDurationMs: Schema.optionalKey(PositiveInt),
  blipDurationMs: Schema.optionalKey(PositiveInt),
  maxDurationMs: Schema.optionalKey(PositiveInt),
  rateRps: Schema.optionalKey(Positive),
  seed: Schema.optionalKey(Schema.NonEmptyString),
  uniqueUsers: Schema.optionalKey(PositiveInt),
});

export type ScenarioStart = typeof ScenarioStart.Type;

export const ScenarioTransition = Schema.Struct({
  at: Schema.Number,
  elapsedMs: Schema.Number,
  phase: ScenarioPhase,
});

export type ScenarioTransition = typeof ScenarioTransition.Type;

export const ScenarioState = Schema.Struct({
  baselineDurationMs: PositiveInt,
  blipDurationMs: PositiveInt,
  failedRequests: Schema.Natural,
  lastError: Schema.optionalKey(Schema.String),
  maxDurationMs: PositiveInt,
  phase: ScenarioPhase,
  rateRps: Positive,
  requested: Schema.Natural,
  runId: Schema.NonEmptyString,
  seed: Schema.NonEmptyString,
  startedAt: Schema.Number,
  status: ScenarioStatus,
  successfulRequests: Schema.Natural,
  transitions: Schema.Array(ScenarioTransition),
  uniqueUsers: PositiveInt,
});

export type ScenarioState = typeof ScenarioState.Type;

export const CheckoutRequest = Schema.Struct({
  amountCents: PositiveInt,
  itemCount: PositiveInt,
  requestId: Schema.NonEmptyString,
  userId: Schema.NonEmptyString,
});

export type CheckoutRequest = typeof CheckoutRequest.Type;

export const FailureRateUpdate = Schema.Struct({
  failureRate: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  seed: Schema.optionalKey(Schema.NonEmptyString),
});
