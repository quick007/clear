import {
  Account,
  DisplayName,
  EmailAddress,
  HostedSubject,
  Project,
  ProjectId,
  Session,
} from "@groundtruth/domain";
import { Schema } from "effect";

export const ReturnPath = Schema.String.check(
  Schema.isLengthBetween(1, 512),
  Schema.isPattern(/^\/(?!\/)/),
).pipe(Schema.brand("ReturnPath"));
export type ReturnPath = typeof ReturnPath.Type;

export const HandoffBrowserNonce = Schema.String.check(Schema.isLengthBetween(32, 512)).pipe(
  Schema.brand("HandoffBrowserNonce"),
);
export type HandoffBrowserNonce = typeof HandoffBrowserNonce.Type;

export class CreateHandoffRequest extends Schema.Class<CreateHandoffRequest>(
  "Groundtruth/Api/CreateHandoffRequest",
)({
  subject: HostedSubject,
  email: EmailAddress,
  displayName: Schema.optional(DisplayName),
  returnPath: Schema.optional(ReturnPath),
  browserNonce: Schema.RedactedFromValue(HandoffBrowserNonce, {
    label: "Browser handoff nonce",
  }),
}) {}

export class HandoffCreated extends Schema.Class<HandoffCreated>("Groundtruth/Api/HandoffCreated")({
  code: Schema.String.check(Schema.isLengthBetween(32, 512)),
  expiresAt: Schema.DateTimeUtcFromString,
}) {}

export const CompleteHandoffQuery = {
  code: Schema.String.check(Schema.isLengthBetween(32, 512)),
  returnPath: Schema.optional(ReturnPath),
} as const;

export class SessionView extends Schema.Class<SessionView>("Groundtruth/Api/SessionView")({
  session: Session,
  account: Schema.NullOr(Account),
  projects: Schema.Array(Project),
  activeProjectId: Schema.NullOr(ProjectId),
}) {}
