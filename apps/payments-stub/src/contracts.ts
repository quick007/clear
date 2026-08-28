import { Schema } from "effect";

const Identifier = Schema.NonEmptyString;
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

export const PaymentAuthorizationRequest = Schema.Struct({
  amountCents: PositiveInt,
  attempt: Schema.Natural,
  requestId: Identifier,
  userId: Identifier,
});

export type PaymentAuthorizationRequest = typeof PaymentAuthorizationRequest.Type;

export const PaymentAuthorizationResponse = Schema.Struct({
  authorizationId: Identifier,
  approved: Schema.Boolean,
});

export type PaymentAuthorizationResponse = typeof PaymentAuthorizationResponse.Type;

const FailureRate = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }));

export const FailureRateUpdate = Schema.Struct({
  failureRate: FailureRate,
  seed: Schema.optionalKey(Schema.NonEmptyString),
});

export type FailureRateUpdate = typeof FailureRateUpdate.Type;

export const FailureState = Schema.Struct({
  effectiveFailureRate: FailureRate,
  failureRate: FailureRate,
  requestsInWindow: Schema.Natural,
  seed: Schema.NonEmptyString,
  windowStartedAt: Schema.Number,
});

export type FailureState = typeof FailureState.Type;
