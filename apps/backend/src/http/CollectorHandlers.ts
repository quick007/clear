import {
  BadRequest,
  GroundtruthApi,
  IngestAuthorization,
  ServiceUnavailable,
  TelemetryAccepted,
  TelemetryActivityObserved,
} from "@groundtruth/api-contract";
import { IngestKeyRejected, type ProjectId } from "@groundtruth/domain";
import { SignalActivity, TelemetryUnavailable } from "@groundtruth/telemetry";
import { DateTime, Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { IngestKeyService } from "../ingest/IngestKeyService.js";
import { LiveEventBus } from "../live/LiveEventBus.js";
import { CollectorIngestService } from "../telemetry/CollectorIngestService.js";

const unavailable = (service: string, message: string) =>
  new ServiceUnavailable({ service, message });
const utf8Encoder = new TextEncoder();

const requestWireBytes = Effect.fn("CollectorHandlers.requestWireBytes")(
  (body: Effect.Effect<string, unknown>) =>
    body.pipe(
      Effect.map((text) => utf8Encoder.encode(text).byteLength),
      Effect.mapError(
        () =>
          new TelemetryUnavailable({
            operation: "read collector request body",
            retryable: true,
            message: "Unable to read the telemetry request body",
          }),
      ),
    ),
);

export const authorizeCollectorProject = Effect.fn("CollectorHandlers.authorizeProject")(function* (
  keys: IngestKeyService["Service"],
  projectId: ProjectId,
  ingestKey: string,
) {
  const verifiedProjectId = yield* keys
    .verify(ingestKey)
    .pipe(
      Effect.catchTag("IngestKeyUnavailable", () =>
        unavailable("ingest-keys", "Ingest key validation is unavailable"),
      ),
    );
  if (verifiedProjectId !== projectId) {
    return yield* new IngestKeyRejected({
      reason: "unknown",
      message: "Ingest key is not authorized for the Collector project header",
    });
  }
});

export const CollectorHandlers = HttpApiBuilder.group(
  GroundtruthApi,
  "collector",
  Effect.fn(function* (handlers) {
    const keys = yield* IngestKeyService;
    const ingest = yield* CollectorIngestService;
    const events = yield* LiveEventBus;

    const accepted = Effect.fn("CollectorHandlers.accepted")(function* (
      projectId: ProjectId,
      ingestKey: string,
      signal: "metrics" | "logs" | "traces",
      operation: ReturnType<
        typeof ingest.enqueueMetrics | typeof ingest.enqueueLogs | typeof ingest.enqueueTraces
      >,
    ) {
      yield* authorizeCollectorProject(keys, projectId, ingestKey);
      const batch = yield* operation.pipe(
        Effect.mapError((error) => {
          if (error._tag === "InvalidOtlpPayload") {
            return new BadRequest({ message: `${error.path}: ${error.message}` });
          }
          if (error._tag === "QuotaExceeded") return error;
          return unavailable("telemetry", error.message);
        }),
      );
      const items =
        signal === "metrics" ? batch.metrics : signal === "logs" ? batch.logs : batch.spans;
      if (items.length > 0) {
        const activity = new SignalActivity({
          signal,
          services: Array.from(new Set(items.map((item) => item.serviceName))),
          itemCount: items.length,
          observedAt: batch.receivedAt,
        });
        yield* events.publish(
          new TelemetryActivityObserved({
            projectId,
            occurredAt: batch.receivedAt,
            activity,
          }),
        );
      }
      return new TelemetryAccepted({
        projectId,
        signal,
        acceptedAt: batch.receivedAt,
      });
    });

    return handlers
      .handle("authorizeIngest", ({ payload }) =>
        keys.verify(payload.ingestKey).pipe(
          Effect.map((projectId) => new IngestAuthorization({ projectId })),
          Effect.catchTag("IngestKeyUnavailable", () =>
            unavailable("ingest-keys", "Ingest key validation is unavailable"),
          ),
        ),
      )
      .handle("ingestMetrics", ({ headers, payload, request }) =>
        accepted(
          headers["x-groundtruth-project-id"],
          headers["x-groundtruth-ingest-key"],
          "metrics",
          requestWireBytes(request.text).pipe(
            Effect.flatMap((wireBytes) =>
              ingest.enqueueMetrics(headers["x-groundtruth-project-id"], payload, wireBytes),
            ),
          ),
        ),
      )
      .handle("ingestLogs", ({ headers, payload, request }) =>
        accepted(
          headers["x-groundtruth-project-id"],
          headers["x-groundtruth-ingest-key"],
          "logs",
          requestWireBytes(request.text).pipe(
            Effect.flatMap((wireBytes) =>
              ingest.enqueueLogs(headers["x-groundtruth-project-id"], payload, wireBytes),
            ),
          ),
        ),
      )
      .handle("ingestTraces", ({ headers, payload, request }) =>
        accepted(
          headers["x-groundtruth-project-id"],
          headers["x-groundtruth-ingest-key"],
          "traces",
          requestWireBytes(request.text).pipe(
            Effect.flatMap((wireBytes) =>
              ingest.enqueueTraces(headers["x-groundtruth-project-id"], payload, wireBytes),
            ),
          ),
        ),
      )
      .handle(
        "publishActivity",
        Effect.fn(function* ({ headers, payload, request }) {
          const projectId = headers["x-groundtruth-project-id"];
          yield* authorizeCollectorProject(keys, projectId, headers["x-groundtruth-ingest-key"]);
          const wireBytes = yield* requestWireBytes(request.text).pipe(
            Effect.mapError((error) => unavailable("telemetry", error.message)),
          );
          yield* ingest
            .recordActivity(projectId, payload.activities, wireBytes)
            .pipe(
              Effect.mapError((error) =>
                error._tag === "QuotaExceeded" ? error : unavailable("telemetry", error.message),
              ),
            );
          const occurredAt = yield* DateTime.now;
          yield* events.publishAll(
            payload.activities.map(
              (activity) => new TelemetryActivityObserved({ projectId, occurredAt, activity }),
            ),
          );
        }),
      );
  }),
);
