import { RecordDeployEventRequest } from "@groundtruth/api-contract";
import {
  EntityNotFound,
  NonEmptyText,
  type ProjectId,
  ServiceName,
  Sha,
  type SessionId,
} from "@groundtruth/domain";
import { Crypto, DateTime, Effect } from "effect";
import type { DeployService } from "../deploys/DeployService.js";
import type { IncidentService } from "../incidents/IncidentService.js";
import type { IncidentState } from "../incidents/IncidentState.js";
import type { LiveEventBus } from "../live/LiveEventBus.js";
import type { TelemetryStore } from "../telemetry/TelemetryStore.js";
import { publishSandboxProgress } from "./SandboxProgress.js";
import { SandboxRecord, type StoredSandbox } from "./SandboxRecord.js";
import { advanceSandboxRuntime, recoverSandboxRuntime } from "./SandboxRuntime.js";
import { canonicalSandboxBatch } from "./SandboxTelemetry.js";

const resolutionBuckets = 12; // 1 minute
const resolutionSummary = NonEmptyText.make(
  "Bounded retries restored normal payment request volume",
);

interface RecoveryServices {
  readonly crypto: Crypto.Crypto;
  readonly deploys: DeployService["Service"];
  readonly incidents: IncidentService["Service"];
  readonly incidentState: IncidentState["Service"];
  readonly events: LiveEventBus["Service"];
  readonly telemetry: TelemetryStore["Service"];
}

export const beginSandboxRecovery = Effect.fn("SandboxRecovery.begin")(function* (
  services: RecoveryServices,
  projectId: ProjectId,
  sessionId: SessionId,
  stored: StoredSandbox,
  now: DateTime.Utc,
) {
  if (stored.record.phase === "baseline") {
    return yield* new EntityNotFound({
      entity: "incident",
      id: sessionId,
      message: "No active sandbox incident is available to recover",
    });
  }
  const touched = { ...stored, lastActiveAt: DateTime.toEpochMillis(now) };
  if (stored.record.phase === "recovery") return { stored: touched, changed: false } as const;

  const firingAlerts = yield* services.incidents.listAlerts(projectId, { status: "firing" });
  if (firingAlerts.length === 0) {
    return yield* new EntityNotFound({
      entity: "alert",
      id: sessionId,
      message: "Wait for the sandbox alert to fire before starting recovery",
    });
  }
  const runtime = yield* recoverSandboxRuntime(stored.runtime).pipe(Effect.orDie);
  yield* services.deploys.record(
    projectId,
    new RecordDeployEventRequest({
      service: ServiceName.make("checkout-api"),
      sha: Sha.make("c1ea7f1"),
      description: NonEmptyText.make("Bound retries with backoff, jitter, and a budget"),
      deployedAt: now,
    }),
  );
  return {
    stored: {
      ...touched,
      record: new SandboxRecord({ session: stored.record.session, phase: "recovery" }),
      runtime,
    } as StoredSandbox,
    changed: true,
  } as const;
});

export const resolveSandboxIncident = Effect.fn("SandboxRecovery.resolve")(function* (
  services: RecoveryServices,
  projectId: ProjectId,
  sessionId: SessionId,
  stored: StoredSandbox,
  now: DateTime.Utc,
  materializedAt: number,
) {
  const incident = yield* services.incidents.getOpenIncident(projectId);
  if (incident === null) {
    return yield* new EntityNotFound({
      entity: "incident",
      id: sessionId,
      message: "No active sandbox incident is available to resolve",
    });
  }
  const recovery = yield* beginSandboxRecovery(services, projectId, sessionId, stored, now);
  const advanced = yield* advanceSandboxRuntime(recovery.stored.runtime, resolutionBuckets).pipe(
    Effect.orDie,
  );
  const latest = advanced.advancedBatches.at(-1);
  const timestampOffsetMilliseconds = latest === undefined ? 0 : materializedAt - latest.bucketEnd;
  const canonical = yield* Effect.forEach(advanced.runtime.batches, (batch) =>
    services.crypto.randomUUIDv7.pipe(
      Effect.orDie,
      Effect.map((id) => canonicalSandboxBatch(batch, id, timestampOffsetMilliseconds)),
    ),
  );
  yield* services.telemetry.replace(projectId, canonical);
  yield* publishSandboxProgress(
    services.crypto,
    services.incidentState,
    services.incidents,
    services.events,
    projectId,
    advanced.advancedBatches,
    timestampOffsetMilliseconds,
  );
  yield* services.incidents.close(projectId, incident.id, resolutionSummary);
  return {
    ...recovery.stored,
    runtime: advanced.runtime,
    materializedAt,
    lastActiveAt: DateTime.toEpochMillis(now),
  } satisfies StoredSandbox;
});
