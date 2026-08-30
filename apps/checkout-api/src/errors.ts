import { Schema } from "effect";

export class PaymentUnavailable extends Schema.TaggedError<PaymentUnavailable>()(
  "PaymentUnavailable",
  {
    attempt: Schema.Natural,
    reason: Schema.String,
    status: Schema.optionalKey(Schema.Number),
  },
) {}

export class CheckoutConflict extends Schema.TaggedError<CheckoutConflict>()("CheckoutConflict", {
  requestId: Schema.String,
}) {}
