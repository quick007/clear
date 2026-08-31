import { AlertChanged, LiveEventId, TelemetryActivityObserved } from "@groundtruth/api-contract";
import type { ProjectId } from "@groundtruth/domain";
import { ServiceName, SignalActivity } from "@groundtruth/telemetry";
import type { TelemetryBatch } from "@groundtruth/telemetry-gen";
import { Crypto, DateTime, Effect } from "effect";
import type { IncidentService } from "../incidents/IncidentService.js";
import type { IncidentState } from "../incidents/IncidentState.js";
import type { LiveEventBus } from "../live/LiveEventBus.js";
import {
  sandboxLatencyBreach,
  sandboxPaymentFailuresStarted,
  sandboxRequestRateBreach,
  sandboxRequestRateRecovery,
} from "./SandboxRuntime.js";
import {
  markSandboxRequestRateFiring,
  markSandboxRequestRateResolved,
  recordSandboxScenarioNote,
} from "./SandboxAlertState.js";

const checkoutService = ServiceName.make("checkout-api");

export const publishSandboxProgress = Effect.fn("SandboxProgress.publish")(function* (
  crypto: Crypto.Crypto,
  incidentState: IncidentState["Service"],
  incidents: IncidentService["Service"],
  events: LiveEventBus["Service"],
  projectId: ProjectId,
  batches: ReadonlyArray<TelemetryBatch>,
  timestampOffsetMilliseconds: number,
) {
  if (sandboxPaymentFailuresStarted(batches) !== null) {
    yield* recordSandboxScenarioNote(
      incidents,
      projectId,
      "Payment failures began in payments-stub.",
    );
  }
  const latencyBreach = sandboxLatencyBreach(batches);
  if (latencyBreach !== null) {
    yield* recordSandboxScenarioNote(
      incidents,
      projectId,
      `Checkout p95 crossed ${latencyBreach.threshold.toFixed(0)} ms.`,
    );
  }
  const requestRateBreach = sandboxRequestRateBreach(batches);
  if (requestRateBreach !== null) {
    const occurredAt = DateTime.fromDateUnsafe(
      new Date(requestRateBreach.timestamp + timestampOffsetMilliseconds),
    );
    const summary = `Payment attempts reached ${requestRateBreach.observed.toFixed(1)} requests per second`;
    const alert = yield* markSandboxRequestRateFiring(
      incidentState,
      projectId,
      occurredAt,
      summary,
    );
    if (alert !== null) {
      yield* events.publish(
        new AlertChanged({
          eventId: LiveEventId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie)),
          projectId,
          occurredAt,
          alert,
          change: "updated",
        }),
      );
      yield* recordSandboxScenarioNote(incidents, projectId, `${summary}.`);
    }
  }
  const requestRateRecovery = sandboxRequestRateRecovery(batches);
  if (requestRateRecovery !== null) {
    const occurredAt = DateTime.fromDateUnsafe(
      new Date(requestRateRecovery.timestamp + timestampOffsetMilliseconds),
    );
    const summary = `Payment attempts returned to ${requestRateRecovery.observed.toFixed(1)} requests per second`;
    const alert = yield* markSandboxRequestRateResolved(
      incidentState,
      projectId,
      occurredAt,
      summary,
    );
    if (alert !== null) {
      yield* events.publish(
        new AlertChanged({
          eventId: LiveEventId.make(yield* crypto.randomUUIDv7.pipe(Effect.orDie)),
          projectId,
          occurredAt,
          alert,
          change: "updated",
        }),
      );
      yield* recordSandboxScenarioNote(incidents, projectId, `${summary}.`);
    }
  }
  const latest = batches.at(-1);
  if (latest === undefined) return;
  const occurredAt = DateTime.fromDateUnsafe(
    new Date(latest.bucketEnd + timestampOffsetMilliseconds),
  );
  const signalCounts = {
    logs: batches.reduce((count, batch) => count + batch.logs.length, 0),
    metrics: batches.reduce((count, batch) => count + batch.metrics.length, 0),
    traces: batches.reduce((count, batch) => count + batch.traces.length, 0),
  } as const;
  yield* Effect.forEach(
    Object.entries(signalCounts),
    ([signal, itemCount]) =>
      itemCount === 0
        ? Effect.void
        : events.publish(
            new TelemetryActivityObserved({
              projectId,
              occurredAt,
              activity: new SignalActivity({
                signal: signal as keyof typeof signalCounts,
                services: [checkoutService],
                itemCount,
                observedAt: occurredAt,
              }),
            }),
          ),
    { discard: true },
  );
});
