import {
  AccessDenied,
  EntityNotFound,
  IngestKeyRejected,
  InvalidCursor,
  InvalidStateTransition,
  ProjectDeleting,
  QuotaExceeded,
  ResourceConflict,
  UnsupportedAlertAggregation,
} from "@groundtruth/domain";
import {
  MetricNotFound,
  QueryTooBroad,
  TelemetryUnavailable,
  TraceNotFound,
} from "@groundtruth/telemetry";
import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const ErrorMessage = Schema.String.check(Schema.isLengthBetween(1, 1_000));

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  { message: ErrorMessage },
  { httpApiStatus: 401 },
) {}

export class BadRequest extends Schema.TaggedError<BadRequest>()(
  "BadRequest",
  { message: ErrorMessage },
  { httpApiStatus: 400 },
) {}

export class ServiceUnavailable extends Schema.TaggedError<ServiceUnavailable>()(
  "ServiceUnavailable",
  {
    service: Schema.String,
    message: ErrorMessage,
  },
  { httpApiStatus: 503 },
) {}

export class StreamFailure extends Schema.TaggedError<StreamFailure>()("StreamFailure", {
  retryable: Schema.Boolean,
  message: ErrorMessage,
}) {}

export const NotFoundError = EntityNotFound.pipe(HttpApiSchema.status(404));
export const AccessDeniedError = AccessDenied.pipe(HttpApiSchema.status(403));
export const ProjectDeletingError = ProjectDeleting.pipe(HttpApiSchema.status(409));
export const ResourceConflictError = ResourceConflict.pipe(HttpApiSchema.status(409));
export const InvalidTransitionError = InvalidStateTransition.pipe(HttpApiSchema.status(409));
export const QuotaExceededError = QuotaExceeded.pipe(HttpApiSchema.status(429));
export const UnsupportedAlertAggregationError = UnsupportedAlertAggregation.pipe(
  HttpApiSchema.status(422),
);
export const InvalidCursorError = InvalidCursor.pipe(HttpApiSchema.status(400));
export const IngestKeyRejectedError = IngestKeyRejected.pipe(HttpApiSchema.status(401));
export const MetricNotFoundError = MetricNotFound.pipe(HttpApiSchema.status(404));
export const TraceNotFoundError = TraceNotFound.pipe(HttpApiSchema.status(404));
export const QueryTooBroadError = QueryTooBroad.pipe(HttpApiSchema.status(422));
export const TelemetryUnavailableError = TelemetryUnavailable.pipe(HttpApiSchema.status(503));

export const TelemetryReadErrors = [
  NotFoundError,
  MetricNotFoundError,
  TraceNotFoundError,
  QueryTooBroadError,
  TelemetryUnavailableError,
  InvalidCursorError,
  AccessDeniedError,
  ProjectDeletingError,
  ServiceUnavailable,
] as const;

export const ReadErrors = [
  NotFoundError,
  AccessDeniedError,
  ProjectDeletingError,
  InvalidCursorError,
  ServiceUnavailable,
] as const;

export const MutationErrors = [
  NotFoundError,
  AccessDeniedError,
  ProjectDeletingError,
  ResourceConflictError,
  InvalidTransitionError,
  QuotaExceededError,
  ServiceUnavailable,
] as const;
