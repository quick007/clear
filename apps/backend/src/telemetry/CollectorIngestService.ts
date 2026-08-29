import type {
  OtlpLogsRequest,
  OtlpMetricsRequest,
  OtlpTracesRequest,
} from "@groundtruth/api-contract";
import { QuotaExceeded, type ProjectId } from "@groundtruth/domain";
import {
  CanonicalTelemetryBatch,
  CollectorBatchId,
  type SignalActivity,
  TelemetryUnavailable,
} from "@groundtruth/telemetry";
import {
  Cause,
  Context,
  Crypto,
  DateTime,
  Deferred,
  Encoding,
  Effect,
  Exit,
  Layer,
  Queue,
  Schema,
  Stream,
} from "effect";
import { InvalidOtlpPayload } from "./InvalidOtlpPayload.js";
import { AlertEvaluator } from "../alerts/AlertEvaluator.js";
import { CollectorQuotaService } from "./CollectorQuotaService.js";
import { validateOtlpAnyValueComplexity } from "./OtlpComplexity.js";
import {
  normalizeLogsRequest,
  normalizeMetricsRequest,
  normalizeTracesRequest,
} from "./OtlpNormalizer.js";
import { TelemetryStore } from "./TelemetryStore.js";

type IngestError = InvalidOtlpPayload | QuotaExceeded | TelemetryUnavailable;
type Completion = Deferred.Deferred<CanonicalTelemetryBatch, IngestError>;

interface IngestJob {
  readonly projectId: ProjectId;
  readonly batch: CanonicalTelemetryBatch;
  readonly completion: Completion;
}

const batchIdFromDigest = (digest: Uint8Array) => {
  const hex = Encoding.encodeHex(digest);
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0b0011) | 0b1000).toString(16);
  return CollectorBatchId.make(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
  );
};

const batchIdentityInput = (
  projectId: ProjectId,
  signal: "metrics" | "logs" | "traces",
  request: OtlpMetricsRequest | OtlpLogsRequest | OtlpTracesRequest,
) => new TextEncoder().encode(`${projectId}\u0000${signal}\u0000${JSON.stringify(request)}`);

export class CollectorIngestService extends Context.Service<
  CollectorIngestService,
  {
    enqueueMetrics(
      projectId: ProjectId,
      request: OtlpMetricsRequest,
      wireBytes: number,
    ): Effect.Effect<CanonicalTelemetryBatch, IngestError>;
    enqueueLogs(
      projectId: ProjectId,
      request: OtlpLogsRequest,
      wireBytes: number,
    ): Effect.Effect<CanonicalTelemetryBatch, IngestError>;
    enqueueTraces(
      projectId: ProjectId,
      request: OtlpTracesRequest,
      wireBytes: number,
    ): Effect.Effect<CanonicalTelemetryBatch, IngestError>;
    recordActivity(
      projectId: ProjectId,
      activities: ReadonlyArray<SignalActivity>,
      wireBytes: number,
    ): Effect.Effect<void, QuotaExceeded | TelemetryUnavailable>;
  }
>()("groundtruth/backend/telemetry/CollectorIngestService") {
  static readonly layer = Layer.effect(
    CollectorIngestService,
    Effect.gen(function* () {
      const store = yield* TelemetryStore;
      const quotas = yield* CollectorQuotaService;
      const alerts = yield* AlertEvaluator;
      const crypto = yield* Crypto.Crypto;
      const queue = yield* Queue.bounded<IngestJob>(64);
      yield* Effect.addFinalizer(() => Queue.shutdown(queue).pipe(Effect.asVoid));

      const canonicalPayloadError = () =>
        new InvalidOtlpPayload({
          path: "$",
          message: "Payload cannot be represented by the canonical telemetry model",
        });

      const normalize = <Request extends OtlpMetricsRequest | OtlpLogsRequest | OtlpTracesRequest>(
        projectId: ProjectId,
        signal: "metrics" | "logs" | "traces",
        request: Request,
        operation: (
          request: Request,
          id: CollectorBatchId,
          receivedAt: DateTime.Utc,
        ) => Effect.Effect<CanonicalTelemetryBatch, InvalidOtlpPayload>,
      ) =>
        Effect.gen(function* () {
          yield* validateOtlpAnyValueComplexity(request);
          const id = yield* crypto
            .digest("SHA-256", batchIdentityInput(projectId, signal, request))
            .pipe(
              Effect.map(batchIdFromDigest),
              Effect.mapError(
                () =>
                  new TelemetryUnavailable({
                    operation: "create collector batch identity",
                    retryable: true,
                    message: "Unable to create a telemetry batch identity",
                  }),
              ),
            );
          const receivedAt = yield* DateTime.now;
          return yield* operation(request, id, receivedAt);
        });

      const process = (job: IngestJob) =>
        Schema.encodeEffect(CanonicalTelemetryBatch)(job.batch).pipe(
          Effect.mapError(() => canonicalPayloadError()),
          Effect.tap(() => store.ingest(job.projectId, job.batch)),
          Effect.as(job.batch),
          Effect.exit,
          Effect.flatMap((exit) =>
            Deferred.done(job.completion, exit).pipe(
              Effect.andThen(
                Exit.isFailure(exit) &&
                  (Cause.hasDies(exit.cause) || Cause.hasInterrupts(exit.cause))
                  ? Effect.failCause(exit.cause)
                  : Effect.void,
              ),
            ),
          ),
        );

      yield* Stream.fromQueue(queue).pipe(Stream.runForEach(process), Effect.forkScoped);

      const submit = (
        projectId: ProjectId,
        batch: CanonicalTelemetryBatch,
        reservation: Parameters<CollectorQuotaService["Service"]["admitSeries"]>[0],
      ) =>
        Effect.gen(function* () {
          yield* quotas.admitSeries(reservation, batch);
          const completion = yield* Deferred.make<CanonicalTelemetryBatch, IngestError>();
          const job = { projectId, batch, completion } satisfies IngestJob;
          yield* Queue.offer(queue, job);
          return yield* Deferred.await(job.completion);
        });

      const enqueueMetrics = Effect.fn("CollectorIngestService.enqueueMetrics")(function* (
        projectId: ProjectId,
        request: OtlpMetricsRequest,
        wireBytes: number,
      ) {
        const reservation = yield* quotas.admitRequest(projectId, wireBytes);
        const batch = yield* normalize(projectId, "metrics", request, normalizeMetricsRequest);
        const accepted = yield* submit(projectId, batch, reservation);
        yield* alerts.trackProject(projectId);
        return accepted;
      });
      const enqueueLogs = Effect.fn("CollectorIngestService.enqueueLogs")(function* (
        projectId: ProjectId,
        request: OtlpLogsRequest,
        wireBytes: number,
      ) {
        const reservation = yield* quotas.admitRequest(projectId, wireBytes);
        const batch = yield* normalize(projectId, "logs", request, normalizeLogsRequest);
        return yield* submit(projectId, batch, reservation);
      });
      const enqueueTraces = Effect.fn("CollectorIngestService.enqueueTraces")(function* (
        projectId: ProjectId,
        request: OtlpTracesRequest,
        wireBytes: number,
      ) {
        const reservation = yield* quotas.admitRequest(projectId, wireBytes);
        const batch = yield* normalize(projectId, "traces", request, normalizeTracesRequest);
        return yield* submit(projectId, batch, reservation);
      });
      const recordActivity = Effect.fn("CollectorIngestService.recordActivity")(function* (
        projectId: ProjectId,
        activities: ReadonlyArray<SignalActivity>,
        wireBytes: number,
      ) {
        yield* quotas.admitRequest(projectId, wireBytes);
        yield* store.recordActivity(projectId, activities);
      });

      return CollectorIngestService.of({
        enqueueMetrics,
        enqueueLogs,
        enqueueTraces,
        recordActivity,
      });
    }),
  );
}
