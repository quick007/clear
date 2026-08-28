import { Schema } from "effect";

export class AuthenticationFailed extends Schema.TaggedError<AuthenticationFailed>()(
  "AuthenticationFailed",
  { scope: Schema.Literals(["control", "service"]) },
) {}
