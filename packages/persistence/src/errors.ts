import { Schema } from "effect";
import { randomUUID } from "node:crypto";

export const PersistenceStore = Schema.Literals(["postgres", "clickhouse"]);
export type PersistenceStore = typeof PersistenceStore.Type;

export class PersistenceError extends Schema.TaggedError<PersistenceError>()("PersistenceError", {
  store: PersistenceStore,
  operation: Schema.String,
  correlationId: Schema.String,
  message: Schema.String,
  retryable: Schema.Boolean,
}) {}

export class MigrationError extends Schema.TaggedError<MigrationError>()("MigrationError", {
  store: PersistenceStore,
  migration: Schema.String,
  message: Schema.String,
}) {}

export class PurgeError extends Schema.TaggedError<PurgeError>()("PurgeError", {
  projectId: Schema.String,
  phase: Schema.Literals(["marking", "telemetry", "product-state", "finalizing", "auth"]),
  message: Schema.String,
  retryable: Schema.Boolean,
}) {}

export const RepositoryQuotaResource = Schema.Literals([
  "incident-timeline",
  "incident-hypotheses",
  "incident-text",
]);
export type RepositoryQuotaResource = typeof RepositoryQuotaResource.Type;

export class RepositoryQuotaExceeded extends Schema.TaggedError<RepositoryQuotaExceeded>()(
  "RepositoryQuotaExceeded",
  {
    resource: RepositoryQuotaResource,
    limit: Schema.Number,
    observed: Schema.Number,
    message: Schema.String,
  },
) {}

export const RepositoryConflictReason = Schema.Literals(["incident-not-open"]);
export type RepositoryConflictReason = typeof RepositoryConflictReason.Type;

export class RepositoryConflict extends Schema.TaggedError<RepositoryConflict>()(
  "RepositoryConflict",
  {
    resource: Schema.Literal("incident"),
    reason: RepositoryConflictReason,
    message: Schema.String,
  },
) {}

export type RepositoryError = PersistenceError | RepositoryQuotaExceeded | RepositoryConflict;

export const repositoryQuotaExceeded = (
  resource: RepositoryQuotaResource,
  limit: number,
  observed: number,
) =>
  new RepositoryQuotaExceeded({
    resource,
    limit,
    observed,
    message: `Repository quota exceeded for ${resource} (limit ${limit})`,
  });

export const repositoryConflict = (reason: RepositoryConflictReason) =>
  new RepositoryConflict({
    resource: "incident",
    reason,
    message: "Incident is not open",
  });

const errorCode = (cause: unknown) => {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) return null;
  const code = cause.code;
  return typeof code === "string" || typeof code === "number" ? String(code) : null;
};

const networkCodes = new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT"]);

export const postgresCauseIsRetryable = (cause: unknown) => {
  const code = errorCode(cause);
  return (
    code === "40001" ||
    code === "40P01" ||
    code === "57P01" ||
    code?.startsWith("08") === true ||
    (code !== null && networkCodes.has(code))
  );
};

export const clickhouseCauseIsRetryable = (cause: unknown) => {
  const code = errorCode(cause);
  return (
    code === "159" ||
    code === "202" ||
    code === "209" ||
    code === "210" ||
    code === "241" ||
    (code !== null && networkCodes.has(code))
  );
};

export const persistenceError = (
  store: PersistenceStore,
  operation: string,
  cause: unknown,
  retryable = false,
) => {
  const correlationId = randomUUID();
  const error = new PersistenceError({
    store,
    operation,
    correlationId,
    message: `Storage operation failed (reference ${correlationId})`,
    retryable,
  });
  Object.defineProperty(error, "cause", {
    value: cause,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return error;
};
