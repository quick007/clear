import { Schema } from "effect";

const Identifier = Schema.String.check(
  Schema.isLengthBetween(1, 160),
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
);
const RequestIdentifier = Schema.String.check(
  Schema.isLengthBetween(1, 128),
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
);
const AmountCents = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10_000_000 }));
const ItemCount = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }));

export const CheckoutRequest = Schema.Struct({
  amountCents: AmountCents,
  itemCount: ItemCount,
  requestId: RequestIdentifier,
  userId: RequestIdentifier,
});

export type CheckoutRequest = typeof CheckoutRequest.Type;

export const PaymentAuthorizationRequest = Schema.Struct({
  amountCents: AmountCents,
  attempt: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
  requestId: RequestIdentifier,
  userId: RequestIdentifier,
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
