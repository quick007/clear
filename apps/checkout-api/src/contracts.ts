import { Schema } from "effect";

const Identifier = Schema.NonEmptyString;
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

export const CheckoutRequest = Schema.Struct({
  amountCents: PositiveInt,
  itemCount: PositiveInt,
  requestId: Identifier,
  userId: Identifier,
});

export type CheckoutRequest = typeof CheckoutRequest.Type;

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

export const CheckoutResponse = Schema.Struct({
  authorizationId: Identifier,
  requestId: Identifier,
  status: Schema.Literal("confirmed"),
});

export type CheckoutResponse = typeof CheckoutResponse.Type;
