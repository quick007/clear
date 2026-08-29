import { Schema } from "effect";
import { SessionId, UserId } from "./ids.ts";

export class HostedSession extends Schema.TaggedClass<HostedSession>("Groundtruth/HostedSession")(
  "hosted",
  {
    id: SessionId,
    userId: UserId,
    createdAt: Schema.DateTimeUtcFromString,
    lastSeenAt: Schema.DateTimeUtcFromString,
    expiresAt: Schema.DateTimeUtcFromString,
  },
) {}

export class SandboxSession extends Schema.TaggedClass<SandboxSession>(
  "Groundtruth/SandboxSession",
)("sandbox", {
  id: SessionId,
  seed: Schema.Int,
  createdAt: Schema.DateTimeUtcFromString,
  expiresAt: Schema.DateTimeUtcFromString,
}) {}

export const Session = Schema.Union([HostedSession, SandboxSession]).pipe(
  Schema.toTaggedUnion("_tag"),
);
export type Session = typeof Session.Type;
