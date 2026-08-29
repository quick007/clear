import { Schema } from "effect";
import { UserId } from "./ids.ts";
import { DisplayName, EmailAddress, HostedSubject } from "./primitives.ts";

export class Account extends Schema.Class<Account>("Groundtruth/Account")({
  id: UserId,
  hostedSubject: HostedSubject,
  email: EmailAddress,
  displayName: Schema.NullOr(DisplayName),
  createdAt: Schema.DateTimeUtcFromString,
  lastSeenAt: Schema.DateTimeUtcFromString,
}) {}
