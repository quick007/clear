import { Effect, Match, Schema } from "effect";
import { HttpClientError } from "effect/unstable/http";

export class ConsoleUnavailable extends Schema.TaggedError<ConsoleUnavailable>()(
  "ConsoleUnavailable",
  { retryable: Schema.Boolean },
) {}

export class ConsoleAuthenticationRequired extends Schema.TaggedError<ConsoleAuthenticationRequired>()(
  "ConsoleAuthenticationRequired",
  {},
) {}

export class ConsoleAccessDenied extends Schema.TaggedError<ConsoleAccessDenied>()(
  "ConsoleAccessDenied",
  {},
) {}

export class ConsoleNotFound extends Schema.TaggedError<ConsoleNotFound>()("ConsoleNotFound", {
  resource: Schema.String,
}) {}

export class ConsoleInvalidRequest extends Schema.TaggedError<ConsoleInvalidRequest>()(
  "ConsoleInvalidRequest",
  {},
) {}

export class ConsoleConflict extends Schema.TaggedError<ConsoleConflict>()("ConsoleConflict", {}) {}

export class ConsoleRateLimited extends Schema.TaggedError<ConsoleRateLimited>()(
  "ConsoleRateLimited",
  {},
) {}

export class ConsoleInvalidResponse extends Schema.TaggedError<ConsoleInvalidResponse>()(
  "ConsoleInvalidResponse",
  {},
) {}

export class ConsoleNoActiveProject extends Schema.TaggedError<ConsoleNoActiveProject>()(
  "ConsoleNoActiveProject",
  {},
) {}

export class ConsoleUnexpected extends Schema.TaggedError<ConsoleUnexpected>()(
  "ConsoleUnexpected",
  {},
) {}

export class ConsoleOutcomeUnknown extends Schema.TaggedError<ConsoleOutcomeUnknown>()(
  "ConsoleOutcomeUnknown",
  {},
) {}

export const ConsoleFailure = Schema.Union([
  ConsoleUnavailable,
  ConsoleAuthenticationRequired,
  ConsoleAccessDenied,
  ConsoleNotFound,
  ConsoleInvalidRequest,
  ConsoleConflict,
  ConsoleRateLimited,
  ConsoleInvalidResponse,
  ConsoleNoActiveProject,
  ConsoleUnexpected,
  ConsoleOutcomeUnknown,
]).pipe(Schema.toTaggedUnion("_tag"));
export type ConsoleFailure = typeof ConsoleFailure.Type;

declare module "@tanstack/react-query" {
  interface Register {
    defaultError: ConsoleFailure;
  }
}

const TaggedFailure = Schema.Struct({ _tag: Schema.String });
const isTaggedFailure = Schema.is(TaggedFailure);

const fromStatus = (status: number): ConsoleFailure => {
  if (status === 401) return new ConsoleAuthenticationRequired();
  if (status === 403) return new ConsoleAccessDenied();
  if (status === 404) return new ConsoleNotFound({ resource: "resource" });
  if (status === 409) return new ConsoleConflict();
  if (status === 429) return new ConsoleRateLimited();
  if (status >= 500) return new ConsoleUnavailable({ retryable: true });
  if (status >= 400) return new ConsoleInvalidRequest();
  return new ConsoleInvalidResponse();
};

const fromHttpClientError = (error: HttpClientError.HttpClientError): ConsoleFailure =>
  Match.value(error.reason).pipe(
    Match.tags({
      DecodeError: () => new ConsoleInvalidResponse(),
      EmptyBodyError: () => new ConsoleInvalidResponse(),
      EncodeError: () => new ConsoleInvalidRequest(),
      InvalidUrlError: () => new ConsoleUnexpected(),
      StatusCodeError: ({ response }) => fromStatus(response.status),
      TransportError: () => new ConsoleUnavailable({ retryable: true }),
    }),
    Match.exhaustive,
  );

const resourceName = (error: typeof TaggedFailure.Type) => {
  if ("entity" in error && typeof error.entity === "string") return error.entity;
  if (error._tag === "MetricNotFound") return "metric";
  if (error._tag === "TraceNotFound") return "trace";
  return "resource";
};

export const normalizeConsoleFailure = (error: unknown): ConsoleFailure => {
  if (Schema.is(ConsoleFailure)(error)) return error;
  if (Schema.isSchemaError(error)) return new ConsoleInvalidResponse();
  if (HttpClientError.isHttpClientError(error)) return fromHttpClientError(error);
  if (!isTaggedFailure(error)) return new ConsoleUnexpected();

  switch (error._tag) {
    case "Unauthorized":
    case "IngestKeyRejected":
      return new ConsoleAuthenticationRequired();
    case "AccessDenied":
      return new ConsoleAccessDenied();
    case "EntityNotFound":
    case "MetricNotFound":
    case "TraceNotFound":
      return new ConsoleNotFound({ resource: resourceName(error) });
    case "BadRequest":
    case "InvalidCursor":
    case "QueryTooBroad":
    case "UnsupportedAlertAggregation":
      return new ConsoleInvalidRequest();
    case "InvalidStateTransition":
    case "ProjectDeleting":
    case "ResourceConflict":
      return new ConsoleConflict();
    case "QuotaExceeded":
      return new ConsoleRateLimited();
    case "ServiceUnavailable":
    case "StreamFailure":
    case "TelemetryUnavailable":
      return new ConsoleUnavailable({
        retryable: "retryable" in error ? error.retryable === true : true,
      });
    default:
      return new ConsoleUnexpected();
  }
};

const shouldReportConsoleFailure = (failure: ConsoleFailure) =>
  failure._tag === "ConsoleInvalidResponse" ||
  failure._tag === "ConsoleUnavailable" ||
  failure._tag === "ConsoleUnexpected";

/**
 * Records diagnostic detail without making it part of the user-facing failure.
 * This is deliberately an Effect so request pipelines can preserve the original
 * cause before mapping it into the browser error algebra.
 */
export const reportConsoleFailure = (context: string, cause: unknown) =>
  Effect.sync(() => {
    if (Schema.is(ConsoleFailure)(cause)) return;
    const failure = normalizeConsoleFailure(cause);
    if (!shouldReportConsoleFailure(failure)) return;
    console.error(`[Clear] ${context}`, { cause, failure });
  }).pipe(Effect.catchDefect(() => Effect.succeed(undefined)));

export const normalizeConsoleEffect =
  (context: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, ConsoleFailure, R> =>
    effect.pipe(
      Effect.tapError((error) => reportConsoleFailure(context, error)),
      Effect.tapDefect((defect) => reportConsoleFailure(context, defect)),
      Effect.catchDefect(() => Effect.fail(new ConsoleUnexpected())),
      Effect.mapError(normalizeConsoleFailure),
    );

export const normalizeConsoleMutationFailure = (error: unknown): ConsoleFailure => {
  const failure = normalizeConsoleFailure(error);
  return failure._tag === "ConsoleUnavailable" ||
    failure._tag === "ConsoleInvalidResponse" ||
    failure._tag === "ConsoleUnexpected"
    ? new ConsoleOutcomeUnknown()
    : failure;
};

export const normalizeConsoleMutationEffect =
  (context: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, ConsoleFailure, R> =>
    effect.pipe(
      Effect.tapError((error) => reportConsoleFailure(context, error)),
      Effect.tapDefect((defect) => reportConsoleFailure(context, defect)),
      Effect.catchDefect(() => Effect.fail(new ConsoleOutcomeUnknown())),
      Effect.mapError(normalizeConsoleMutationFailure),
    );

export const mutationOutcomeIsUnknown = (error: unknown) =>
  normalizeConsoleFailure(error)._tag === "ConsoleOutcomeUnknown";

export interface ErrorPresentation {
  readonly message: string;
  readonly retryable: boolean;
  readonly title: string;
}

export interface ConsoleRecoveryLink {
  readonly href: string;
  readonly label: string;
}

export interface ConsoleRecoveryOptions {
  readonly invalidRequest?: ConsoleRecoveryLink;
  readonly notFound?: ConsoleRecoveryLink;
  readonly returnPath?: string;
}

export type ConsoleRecoveryAction =
  | { readonly _tag: "Link"; readonly href: string; readonly label: string }
  | { readonly _tag: "None" }
  | { readonly _tag: "Retry"; readonly label: string };

export const presentConsoleFailure = (error: unknown): ErrorPresentation =>
  Match.value(normalizeConsoleFailure(error)).pipe(
    Match.tags({
      ConsoleAccessDenied: () => ({
        message: "You do not have access to this project.",
        retryable: false,
        title: "Access unavailable",
      }),
      ConsoleAuthenticationRequired: () => ({
        message: "Your session has ended. Log in again to continue.",
        retryable: false,
        title: "Log in again",
      }),
      ConsoleConflict: () => ({
        message: "This changed while you were viewing it. Refresh and try again.",
        retryable: true,
        title: "Clear could not save that change",
      }),
      ConsoleInvalidRequest: () => ({
        message: "Clear could not complete that request.",
        retryable: false,
        title: "Request not completed",
      }),
      ConsoleInvalidResponse: () => ({
        message: "Clear received an unexpected response. Try again in a moment.",
        retryable: true,
        title: "Response could not be read",
      }),
      ConsoleNoActiveProject: () => ({
        message: "Choose or create a project to continue.",
        retryable: false,
        title: "No project selected",
      }),
      ConsoleNotFound: ({ resource }) => ({
        message: `This ${resource} is no longer available.`,
        retryable: false,
        title: "Data not found",
      }),
      ConsoleOutcomeUnknown: () => ({
        message:
          "Clear did not receive confirmation. The change may have completed. Check the current state before trying again.",
        retryable: false,
        title: "Confirmation not received",
      }),
      ConsoleRateLimited: () => ({
        message: "Clear is receiving too many requests. Wait a moment before trying again.",
        retryable: false,
        title: "Request limit reached",
      }),
      ConsoleUnavailable: ({ retryable }) => ({
        message: retryable
          ? "Clear could not reach the API. Check your connection and try again."
          : "Clear cannot complete this request right now.",
        retryable,
        title: "Clear is unavailable",
      }),
      ConsoleUnexpected: () => ({
        message: "Clear could not complete this request. Refresh the page and try again.",
        retryable: true,
        title: "Something went wrong",
      }),
    }),
    Match.exhaustive,
  );

const signInHref = (returnPath: string) => {
  const safeReturnPath =
    returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/board";
  return `/auth/chatgpt?returnPath=${encodeURIComponent(safeReturnPath)}`;
};

const noRecovery = { _tag: "None" } as const;
const retryRecovery = { _tag: "Retry", label: "Try again" } as const;

export const recoveryActionForConsoleFailure = (
  error: unknown,
  options: ConsoleRecoveryOptions = {},
): ConsoleRecoveryAction => {
  const failure = normalizeConsoleFailure(error);
  if (presentConsoleFailure(failure).retryable) return retryRecovery;

  return Match.value(failure).pipe(
    Match.tags({
      ConsoleAccessDenied: () => ({
        _tag: "Link" as const,
        href: "/",
        label: "Return home",
      }),
      ConsoleAuthenticationRequired: () => ({
        _tag: "Link" as const,
        href: signInHref(options.returnPath ?? "/board"),
        label: "Log in again",
      }),
      ConsoleConflict: () => retryRecovery,
      ConsoleInvalidRequest: () =>
        options.invalidRequest ? { _tag: "Link" as const, ...options.invalidRequest } : noRecovery,
      ConsoleInvalidResponse: () => retryRecovery,
      ConsoleNoActiveProject: () => ({
        _tag: "Link" as const,
        href: signInHref(options.returnPath ?? "/connect"),
        label: "Log in to create a project",
      }),
      ConsoleNotFound: () => ({
        _tag: "Link" as const,
        ...(options.notFound ?? { href: "/board", label: "Go to board" }),
      }),
      ConsoleOutcomeUnknown: () => noRecovery,
      ConsoleRateLimited: () => noRecovery,
      ConsoleUnavailable: () => noRecovery,
      ConsoleUnexpected: () => retryRecovery,
    }),
    Match.exhaustive,
  );
};

export const shouldRetryConsoleFailure = (failureCount: number, error: unknown) => {
  const failure = normalizeConsoleFailure(error);
  return (
    failureCount < 2 &&
    (failure._tag === "ConsoleUnavailable" || failure._tag === "ConsoleInvalidResponse") &&
    (failure._tag !== "ConsoleUnavailable" || failure.retryable)
  );
};
