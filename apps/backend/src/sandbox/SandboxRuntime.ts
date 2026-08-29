import { makeTelemetryGenerator, type TelemetryBatch } from "@groundtruth/telemetry-gen";
import type { SandboxSession } from "@groundtruth/domain";
import { DateTime, Effect } from "effect";

const bucketMilliseconds = 10 * 1_000; // 10 seconds
const baselineBuckets = 30; // 5 minutes
const incidentBuckets = 30; // 5 minutes
const historyMilliseconds = (baselineBuckets + incidentBuckets) * bucketMilliseconds;

type Generator = Effect.Success<ReturnType<typeof makeTelemetryGenerator>>;

export interface SandboxRuntime {
  readonly generator: Generator;
  readonly batches: ReadonlyArray<TelemetryBatch>;
}

export const makeSandboxRuntime = (session: SandboxSession, now: DateTime.Utc) =>
  Effect.gen(function* () {
    const generator = yield* makeTelemetryGenerator({
      seed: String(session.seed),
      startedAt: DateTime.toEpochMillis(now) - historyMilliseconds,
      bucketDurationMs: bucketMilliseconds,
    });
    const batches = yield* generator.advance(baselineBuckets);
    return { generator, batches };
  });

export const triggerSandboxRuntime = (runtime: SandboxRuntime) =>
  Effect.gen(function* () {
    yield* runtime.generator.triggerIncident;
    const incident = yield* runtime.generator.advance(incidentBuckets);
    return {
      generator: runtime.generator,
      batches: [...runtime.batches, ...incident],
    };
  });
