import { Clock, Effect, Ref, Schema } from "effect";

import { incidentId, ScenarioPhase, sequence, sha, timestamp } from "./domain/primitives.ts";
import { DeployAnnotation, TelemetryBatch } from "./domain/telemetry.ts";
import {
  InvalidAdvanceCount,
  InvalidScenarioTransition,
  RecoveryOrigin,
  ScenarioAdvance,
  ScenarioConfig,
  ScenarioState,
} from "./domain/scenario.ts";
import { generateAlerts } from "./generate/alerts.ts";
import { generateLogs } from "./generate/logs.ts";
import { generateMetrics } from "./generate/metrics.ts";
import { generateTraces } from "./generate/traces.ts";
import { makeBucketProfile } from "./profile.ts";
import { deterministicHex } from "./random.ts";

export const ScenarioOptions = Schema.Struct({
  seed: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
  startedAt: Schema.optionalKey(Schema.Natural),
  bucketDurationMs: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1_000))),
  upstreamBlipBuckets: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  baselineRequestsPerSecond: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  uniqueUsersPerFiveMinutes: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 9_999 })),
  ),
  tracesPerBucket: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  ),
});
export type ScenarioOptions = typeof ScenarioOptions.Type;

const DeployOptions = Schema.Struct({
  sha: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[0-9a-f]{7,40}$/))),
  description: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
  url: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
type DeployOptions = typeof DeployOptions.Type;

class InvalidFixSimulationTransition extends Schema.TaggedError<InvalidFixSimulationTransition>()(
  "InvalidScenarioTransition",
  {
    action: Schema.Literal("simulateFixDeploy"),
    phase: ScenarioPhase,
    message: Schema.String,
  },
) {}

const makeConfig = (options: unknown) =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(ScenarioOptions)(options);
    const bucketDurationMs = decoded.bucketDurationMs ?? 10_000; // 10 seconds
    const currentTime = yield* Clock.currentTimeMillis;
    const startedAt =
      decoded.startedAt ?? Math.floor(currentTime / bucketDurationMs) * bucketDurationMs;

    return new ScenarioConfig({
      seed: decoded.seed ?? "groundtruth",
      startedAt: timestamp(startedAt),
      bucketDurationMs,
      upstreamBlipBuckets: decoded.upstreamBlipBuckets ?? 6, // 1 minute
      baselineRequestsPerSecond: decoded.baselineRequestsPerSecond ?? 50,
      uniqueUsersPerFiveMinutes: decoded.uniqueUsersPerFiveMinutes ?? 800,
      tracesPerBucket: decoded.tracesPerBucket ?? 6,
    });
  });

export const makeInitialState = (config: ScenarioConfig) =>
  new ScenarioState({
    config,
    phase: "P0",
    sequence: sequence(0),
    phaseBucket: 0,
    incidentId: null,
    pendingAnnotations: [],
    recoveryOrigin: null,
  });

const nextState = (state: ScenarioState) => {
  const nextPhaseBucket = state.phaseBucket + 1;
  const enterAmplification =
    state.phase === "P1" && nextPhaseBucket >= state.config.upstreamBlipBuckets;

  return new ScenarioState({
    config: state.config,
    phase: enterAmplification ? "P2" : state.phase,
    sequence: sequence(state.sequence + 1),
    phaseBucket: enterAmplification ? 0 : nextPhaseBucket,
    incidentId: state.incidentId,
    pendingAnnotations: [],
    recoveryOrigin: state.recoveryOrigin,
  });
};

const generateOne = (state: ScenarioState) => {
  const bucketStart = timestamp(
    state.config.startedAt + state.sequence * state.config.bucketDurationMs,
  );
  const bucketEnd = timestamp(bucketStart + state.config.bucketDurationMs);
  const profile = makeBucketProfile(
    state.config,
    state.phase,
    state.phaseBucket,
    state.recoveryOrigin,
  );
  const previousProfile =
    state.phaseBucket > 0
      ? makeBucketProfile(state.config, state.phase, state.phaseBucket - 1, state.recoveryOrigin)
      : state.phase === "P4" && state.recoveryOrigin !== null
        ? makeBucketProfile(
            state.config,
            state.recoveryOrigin.phase,
            state.recoveryOrigin.phaseBucket,
          )
        : null;
  const traces = generateTraces(state.config, state.phase, state.phaseBucket, bucketStart, profile);
  const batch = new TelemetryBatch({
    sequence: state.sequence,
    phase: state.phase,
    bucketStart,
    bucketEnd,
    metrics: generateMetrics(state.config, state.phaseBucket, bucketEnd, profile),
    logs: generateLogs(state.phase, state.phaseBucket, bucketStart, profile, traces),
    traces,
    alerts: generateAlerts(
      state.phase,
      state.phaseBucket,
      bucketEnd,
      profile,
      previousProfile,
      state.config.bucketDurationMs,
    ),
    annotations: state.pendingAnnotations,
  });

  return [batch, nextState(state)] as const;
};

const positiveBucketCount = Schema.Int.check(Schema.isGreaterThan(0));

const advanceUnchecked = (state: ScenarioState, count: number) => {
  const batches: Array<TelemetryBatch> = [];
  let current = state;
  for (let index = 0; index < count; index += 1) {
    const [batch, following] = generateOne(current);
    batches.push(batch);
    current = following;
  }
  return new ScenarioAdvance({ state: current, batches });
};

export const advanceScenario = (state: ScenarioState, count: number) =>
  Schema.decodeUnknownEffect(positiveBucketCount)(count).pipe(
    Effect.mapError(
      () =>
        new InvalidAdvanceCount({
          count,
          message: "Advance count must be a positive integer",
        }),
    ),
    Effect.map((validCount) => advanceUnchecked(state, validCount)),
  );

const makeIncidentState = (state: ScenarioState) =>
  new ScenarioState({
    config: state.config,
    phase: "P1",
    sequence: state.sequence,
    phaseBucket: 0,
    incidentId: incidentId(
      `inc_${deterministicHex(state.config.seed, state.sequence, "incident", 12)}`,
    ),
    pendingAnnotations: state.pendingAnnotations,
    recoveryOrigin: null,
  });

export const triggerIncident = (state: ScenarioState) => {
  if (state.phase !== "P0") {
    return Effect.fail(
      new InvalidScenarioTransition({
        action: "triggerIncident",
        phase: state.phase,
        message: "An incident can only be triggered from baseline",
      }),
    );
  }

  return Effect.succeed(makeIncidentState(state));
};

const makeRecoveryState = (
  state: ScenarioState,
  originPhase: "P1" | "P2",
  options: DeployOptions,
) => {
  const deploy = new DeployAnnotation({
    service: "checkout-api",
    sha: sha(options.sha ?? deterministicHex(state.config.seed, state.sequence, "fix-deploy", 12)),
    description:
      options.description ?? "Add exponential backoff, jitter, retry budget, and circuit breaker",
    url: options.url ?? null,
    timestamp: timestamp(state.config.startedAt + state.sequence * state.config.bucketDurationMs),
  });

  return new ScenarioState({
    config: state.config,
    phase: "P4",
    sequence: state.sequence,
    phaseBucket: 0,
    incidentId: state.incidentId,
    pendingAnnotations: [deploy],
    recoveryOrigin: new RecoveryOrigin({
      phase: originPhase,
      phaseBucket: Math.max(0, state.phaseBucket - 1),
    }),
  });
};

const simulateFixDeploy = (state: ScenarioState, input: unknown = {}) =>
  Effect.gen(function* () {
    if (state.phase !== "P1" && state.phase !== "P2") {
      return yield* new InvalidFixSimulationTransition({
        action: "simulateFixDeploy",
        phase: state.phase,
        message: "A fix can only be deployed while an incident is active",
      });
    }

    const options = yield* Schema.decodeUnknownEffect(DeployOptions)(input);
    return makeRecoveryState(state, state.phase, options);
  });

const makeTelemetryGeneratorRuntime = (options: unknown = {}) =>
  Effect.gen(function* () {
    const config = yield* makeConfig(options);
    const initial = makeInitialState(config);
    const state = yield* Ref.make(initial);

    const advance = (count = 1) =>
      Schema.decodeUnknownEffect(positiveBucketCount)(count).pipe(
        Effect.mapError(
          () =>
            new InvalidAdvanceCount({
              count,
              message: "Advance count must be a positive integer",
            }),
        ),
        Effect.flatMap((validCount) =>
          Ref.modify(state, (current) => {
            const result = advanceUnchecked(current, validCount);
            return [result.batches, result.state] as const;
          }),
        ),
      );

    const trigger = Ref.modify(state, (current) => {
      if (current.phase !== "P0") {
        return [triggerIncident(current), current] as const;
      }
      const next = makeIncidentState(current);
      return [Effect.succeed(next), next] as const;
    }).pipe(Effect.flatten);

    const deploy = (input: unknown = {}) =>
      Schema.decodeUnknownEffect(DeployOptions)(input).pipe(
        Effect.flatMap((options) =>
          Ref.modify(state, (current) => {
            if (current.phase !== "P1" && current.phase !== "P2") {
              return [simulateFixDeploy(current, options), current] as const;
            }
            const next = makeRecoveryState(current, current.phase, options);
            return [Effect.succeed(next), next] as const;
          }),
        ),
        Effect.flatten,
      );

    return {
      config,
      state: Ref.get(state),
      next: advance(1).pipe(Effect.map((batches) => batches[0]!)),
      advance,
      triggerIncident: trigger,
      simulateFixDeploy: deploy,
      reset: Ref.set(state, initial),
    };
  });

export const makeTelemetryGenerator = (options: unknown = {}) =>
  makeTelemetryGeneratorRuntime(options).pipe(
    Effect.map((generator) => ({
      config: generator.config,
      state: generator.state,
      next: generator.next,
      advance: generator.advance,
      triggerIncident: generator.triggerIncident,
      simulateFixDeploy: generator.simulateFixDeploy,
      reset: generator.reset,
    })),
  );

export const makeTelemetryGeneratorFixture = makeTelemetryGeneratorRuntime;
