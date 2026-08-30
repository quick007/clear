import { Effect, Match, Schema } from "effect";

import {
  ConsoleUnexpected,
  normalizeConsoleFailure,
  reportConsoleFailure,
  type ConsoleFailure,
} from "../errors";

export class ToolInputRejected extends Schema.TaggedError<ToolInputRejected>()(
  "ToolInputRejected",
  {},
) {}

export class NoActiveIncident extends Schema.TaggedError<NoActiveIncident>()(
  "NoActiveIncident",
  {},
) {}

const ToolSpecificFailure = Schema.Union([ToolInputRejected, NoActiveIncident]).pipe(
  Schema.toTaggedUnion("_tag"),
);
type ToolSpecificFailure = typeof ToolSpecificFailure.Type;

export type ToolExecutionFailure = ConsoleFailure | ToolSpecificFailure;

export const normalizeToolExecutionFailure = (cause: unknown): ToolExecutionFailure =>
  Schema.is(ToolSpecificFailure)(cause) ? cause : normalizeConsoleFailure(cause);

export const normalizeToolEffect =
  (context: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, ToolExecutionFailure, R> =>
    effect.pipe(
      Effect.tapError((cause) =>
        Schema.is(ToolSpecificFailure)(cause)
          ? Effect.succeed(undefined)
          : reportConsoleFailure(context, cause),
      ),
      Effect.tapDefect((defect) => reportConsoleFailure(context, defect)),
      Effect.catchDefect(() => Effect.fail(new ConsoleUnexpected())),
      Effect.mapError(normalizeToolExecutionFailure),
    );

export interface ToolFailurePresentation {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ToolFailureContext {
  readonly readOnly: boolean;
}

const writeOutcomeIsUnknown = (failure: ConsoleFailure, context: ToolFailureContext) =>
  !context.readOnly &&
  (failure._tag === "ConsoleUnavailable" ||
    failure._tag === "ConsoleInvalidResponse" ||
    failure._tag === "ConsoleOutcomeUnknown" ||
    failure._tag === "ConsoleUnexpected");

const presentConsoleToolFailure = (
  failure: ConsoleFailure,
  context: ToolFailureContext,
): ToolFailurePresentation => {
  if (writeOutcomeIsUnknown(failure, context)) {
    return {
      code: failure._tag,
      message:
        "Clear did not confirm whether the change completed. Read the current state before deciding whether another write is needed.",
      retryable: false,
    };
  }

  return Match.value(failure).pipe(
    Match.tags({
      ConsoleAccessDenied: () => ({
        code: "ConsoleAccessDenied",
        message: "The active Clear session cannot access this project.",
        retryable: false,
      }),
      ConsoleAuthenticationRequired: () => ({
        code: "ConsoleAuthenticationRequired",
        message: "The Clear session has ended. Ask the user to log in before retrying.",
        retryable: false,
      }),
      ConsoleConflict: () => ({
        code: "ConsoleConflict",
        message: "The resource changed after it was read. Read the current state before retrying.",
        retryable: true,
      }),
      ConsoleInvalidRequest: () => ({
        code: "ConsoleInvalidRequest",
        message: "Clear rejected the request. Review the tool input before trying again.",
        retryable: false,
      }),
      ConsoleInvalidResponse: () => ({
        code: "ConsoleInvalidResponse",
        message: "Clear received a response it could not read. Try again in a moment.",
        retryable: true,
      }),
      ConsoleNoActiveProject: () => ({
        code: "ConsoleNoActiveProject",
        message: "No project is active. Ask the user to choose or create one.",
        retryable: false,
      }),
      ConsoleNotFound: ({ resource }) => ({
        code: "ConsoleNotFound",
        message: `This ${resource} is no longer available. Read the current state before retrying.`,
        retryable: false,
      }),
      ConsoleOutcomeUnknown: () => ({
        code: "ConsoleOutcomeUnknown",
        message:
          "Clear did not confirm whether the change completed. Read the current state before deciding whether another write is needed.",
        retryable: false,
      }),
      ConsoleRateLimited: () => ({
        code: "ConsoleRateLimited",
        message: "Clear is receiving too many requests. Wait before trying again.",
        retryable: true,
      }),
      ConsoleUnavailable: ({ retryable }) => ({
        code: "ConsoleUnavailable",
        message: retryable
          ? "Clear could not reach the API. Try again in a moment."
          : "Clear could not reach the API. Ask the user to check the service before continuing.",
        retryable,
      }),
      ConsoleUnexpected: () => ({
        code: "ConsoleUnexpected",
        message: "Clear could not complete the tool request. Try again in a moment.",
        retryable: true,
      }),
    }),
    Match.exhaustive,
  );
};

export const presentToolExecutionFailure = (
  failure: ToolExecutionFailure,
  context: ToolFailureContext,
): ToolFailurePresentation => {
  if (!Schema.is(ToolSpecificFailure)(failure)) {
    return presentConsoleToolFailure(failure, context);
  }

  return Match.value(failure).pipe(
    Match.tags({
      NoActiveIncident: () => ({
        code: "NO_ACTIVE_INCIDENT",
        message: "No incident is currently open.",
        retryable: false,
      }),
      ToolInputRejected: () => ({
        code: "INVALID_TOOL_INPUT",
        message:
          "The input does not match this tool's declared schema. Check field names, value types, and allowed values.",
        retryable: false,
      }),
    }),
    Match.exhaustive,
  );
};

export const toolFailureIsRetryable = (failure: ToolExecutionFailure) =>
  presentToolExecutionFailure(failure, { readOnly: true }).retryable;

export const toolFailureHasUnknownWriteOutcome = (
  failure: ToolExecutionFailure,
  context: ToolFailureContext,
) => !Schema.is(ToolSpecificFailure)(failure) && writeOutcomeIsUnknown(failure, context);

export const ToolRegistrationScope = Schema.Literals([
  "session",
  "sandbox",
  "incident",
  "reconciliation",
]);
export type ToolRegistrationScope = typeof ToolRegistrationScope.Type;

export class WebMcpRegistrationFailure extends Schema.TaggedError<WebMcpRegistrationFailure>()(
  "WebMcpRegistrationFailure",
  {
    scope: ToolRegistrationScope,
    cause: Schema.Unknown,
  },
) {}

export const isWebMcpRegistrationFailure = Schema.is(WebMcpRegistrationFailure);

export const normalizeRegistrationFailure = (
  scope: ToolRegistrationScope,
  cause: unknown,
): WebMcpRegistrationFailure =>
  isWebMcpRegistrationFailure(cause) ? cause : new WebMcpRegistrationFailure({ scope, cause });

export const reportRegistrationFailure = (failure: WebMcpRegistrationFailure) =>
  Effect.sync(() => {
    console.error(`[Clear] ${failure.scope} site tool registration failed`, {
      cause: failure.cause,
      failure,
    });
  }).pipe(Effect.catchDefect(() => Effect.succeed(undefined)));
