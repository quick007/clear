import { Schema } from "effect";

export class InvalidOtlpPayload extends Schema.TaggedError<InvalidOtlpPayload>()(
  "InvalidOtlpPayload",
  {
    path: Schema.String,
    message: Schema.String.check(Schema.isLengthBetween(1, 1_000)),
  },
) {}
