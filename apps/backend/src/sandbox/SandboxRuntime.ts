import type { SandboxPhase } from "@groundtruth/api-contract";
import {
  makeTelemetryGenerator,
  type ScenarioPhase,
  type TelemetryBatch,
} from "@groundtruth/telemetry-gen";
import type { SandboxSession } from "@groundtruth/domain";
import { DateTime, Effect } from "effect";

export const sandboxBucketMilliseconds = 5 * 1_000; // 5 seconds
const baselineBuckets = 60; // 5 minutes
const maximumRetainedBuckets = 180; // 15 minutes

type Generator = Effect.Success<ReturnType<typeof makeTelemetryGenerator>>;

export interface SandboxRuntime {
  readonly generator: Generator;
  readonly batches: ReadonlyArray<TelemetryBatch>;
}

export interface SandboxRuntimeAdvance {
  readonly advancedBatches: ReadonlyArray<TelemetryBatch>;
  readonly runtime: SandboxRuntime;
}

export const makeSandboxRuntime = (
  session: SandboxSession,
  now: DateTime.Utc,
): Effect.Effect<SandboxRuntime> =>
  Effect.gen(function* () {
    const anchor =
      Math.floor(DateTime.toEpochMillis(now) / sandboxBucketMilliseconds) *
      sandboxBucketMilliseconds;
    const generator = yield* makeTelemetryGenerator({
      seed: String(session.seed),
      startedAt: anchor - baselineBuckets * sandboxBucketMilliseconds,
      bucketDurationMs: sandboxBucketMilliseconds,
      tracesPerBucket: 2,
      upstreamBlipBuckets: 3,
    }).pipe(Effect.orDie);
    const batches = yield* generator.advance(baselineBuckets).pipe(Effect.orDie);
    return { generator, batches };
  });

export const triggerSandboxRuntime = (runtime: SandboxRuntime): Effect.Effect<SandboxRuntime> =>
  Effect.gen(function* () {
    yield* runtime.generator.triggerIncident.pipe(Effect.orDie);
    return runtime;
  });

export const recoverSandboxRuntime = (runtime: SandboxRuntime): Effect.Effect<SandboxRuntime> =>
  runtime.generator
    .simulateFixDeploy({
      description: "Bound retries with backoff, jitter, and a retry budget",
    })
    .pipe(Effect.orDie, Effect.as(runtime));

export const advanceSandboxRuntime = (
  runtime: SandboxRuntime,
  count: number,
): Effect.Effect<SandboxRuntimeAdvance> =>
  Effect.gen(function* () {
    const batches = yield* runtime.generator.advance(count).pipe(Effect.orDie);
    return {
      advancedBatches: batches,
      runtime: {
        generator: runtime.generator,
        batches: [...runtime.batches, ...batches].slice(-maximumRetainedBuckets),
      },
    };
  });

const sandboxPhaseForScenario = (phase: ScenarioPhase): SandboxPhase => {
  switch (phase) {
    case "P0":
      return "baseline";
    case "P1":
      return "upstream-blip";
    case "P2":
      return "amplification";
    case "P4":
      return "recovery";
  }
};

export const sandboxRuntimePhase = (runtime: SandboxRuntime): Effect.Effect<SandboxPhase> =>
  runtime.batches.at(-1) === undefined
    ? runtime.generator.state.pipe(Effect.map((state) => sandboxPhaseForScenario(state.phase)))
    : Effect.succeed(sandboxPhaseForScenario(runtime.batches.at(-1)!.phase));

const scenarioAlert = (
  batches: ReadonlyArray<TelemetryBatch>,
  alertId: string,
  tag: "AlertFired" | "AlertResolved" = "AlertFired",
) =>
  batches
    .flatMap((batch) => batch.alerts)
    .find((alert) => alert._tag === tag && alert.alertId === alertId) ?? null;

export const sandboxPaymentFailuresStarted = (batches: ReadonlyArray<TelemetryBatch>) =>
  scenarioAlert(batches, "checkout-upstream-errors");

export const sandboxLatencyBreach = (batches: ReadonlyArray<TelemetryBatch>) =>
  scenarioAlert(batches, "checkout-latency-p95");

export const sandboxRequestRateBreach = (batches: ReadonlyArray<TelemetryBatch>) =>
  scenarioAlert(batches, "checkout-upstream-request-rate");

export const sandboxRequestRateRecovery = (batches: ReadonlyArray<TelemetryBatch>) =>
  scenarioAlert(batches, "checkout-upstream-request-rate", "AlertResolved");
