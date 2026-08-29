import { ProjectId } from "@groundtruth/domain";
import { SignalActivity, SignalKind } from "@groundtruth/telemetry";
import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export const CollectorIngestKey = Schema.String.check(Schema.isLengthBetween(16, 512));

export class AuthorizeIngestRequest extends Schema.Class<AuthorizeIngestRequest>(
  "Groundtruth/Api/AuthorizeIngestRequest",
)({
  ingestKey: CollectorIngestKey,
}) {}

export class IngestAuthorization extends Schema.Class<IngestAuthorization>(
  "Groundtruth/Api/IngestAuthorization",
)({
  projectId: ProjectId,
}) {}

export const CollectorProjectHeaders = {
  "x-groundtruth-ingest-key": CollectorIngestKey,
  "x-groundtruth-project-id": ProjectId,
} as const;

export class TelemetryAccepted extends Schema.Class<TelemetryAccepted>(
  "Groundtruth/Api/TelemetryAccepted",
)({
  projectId: ProjectId,
  signal: SignalKind,
  acceptedAt: Schema.DateTimeUtcFromString,
}) {}

export const TelemetryAcceptedResponse = TelemetryAccepted.pipe(HttpApiSchema.status(202));

const activityServiceLimit = 64;
const TelemetryActivityHintFields = Schema.Struct({
  activities: Schema.Array(SignalActivity).check(Schema.isMaxLength(3)),
  droppedNotifications: Schema.Natural,
});
const BoundedTelemetryActivityHint = TelemetryActivityHintFields.check(
  Schema.makeFilter<typeof TelemetryActivityHintFields.Type>((hint) => {
    const activityIndex = hint.activities.findIndex(
      ({ services }) => services.length > activityServiceLimit,
    );
    return activityIndex === -1
      ? undefined
      : {
          path: ["activities", activityIndex, "services"],
          issue: `activity services must contain at most ${activityServiceLimit} entries`,
        };
  }),
);

export class TelemetryActivityHint extends Schema.Class<TelemetryActivityHint>(
  "Groundtruth/Api/TelemetryActivityHint",
)(BoundedTelemetryActivityHint) {}
