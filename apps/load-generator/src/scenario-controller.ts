import { Clock, Context, Effect, Fiber, Layer, Metric, Option, Ref, Semaphore } from "effect";
import { CheckoutClient } from "./checkout-client.js";
import { GeneratorConfig } from "./config.js";
import { ScenarioPhase, ScenarioStart, ScenarioState, ScenarioTransition } from "./contracts.js";
import { ExampleServiceUnavailable, ScenarioAlreadyRunning, ScenarioNotRunning } from "./errors.js";
import { configuredRate, configuredUsers, scenarioPhase } from "./metrics.js";
import { PaymentsAdmin } from "./payments-admin.js";
import { requestFor } from "./request-shape.js";

const baselineFailureRate = 0.002;
const incidentFailureRate = 0.02;

const phaseValues: Record<ScenarioPhase, number> = {
  amplification: 3,
  baseline: 1,
  blip: 2,
  completed: 6,
  idle: 0,
  recovery: 4,
  stopped: 5,
};

export const phaseAt = (
  elapsedMs: number,
  baselineDurationMs: number,
  blipDurationMs: number,
): ScenarioPhase => {
  if (elapsedMs < baselineDurationMs) return "baseline";
  if (elapsedMs < baselineDurationMs + blipDurationMs) return "blip";
  return "amplification";
};

const normalize = (config: GeneratorConfig["Service"], input: ScenarioStart) => ({
  baselineDurationMs: input.baselineDurationMs ?? config.baselineDurationMs,
  blipDurationMs: input.blipDurationMs ?? config.blipDurationMs,
  maxDurationMs: input.maxDurationMs ?? config.maxDurationMs,
  rateRps: input.rateRps ?? config.baselineRps,
  seed: input.seed ?? config.scenarioSeed,
  uniqueUsers: Math.floor(input.uniqueUsers ?? config.uniqueUsers),
});

const transition = (state: ScenarioState, phase: ScenarioPhase, at: number) =>
  ScenarioState.make({
    ...state,
    phase,
    transitions: [
      ...state.transitions,
      ScenarioTransition.make({
        at,
        elapsedMs: Math.max(0, at - state.startedAt),
        phase,
      }),
    ],
  });

export class ScenarioController extends Context.Service<
  ScenarioController,
  {
    readonly recover: Effect.Effect<ScenarioState, ScenarioNotRunning | ExampleServiceUnavailable>;
    readonly start: (
      input: ScenarioStart,
    ) => Effect.Effect<ScenarioState, ScenarioAlreadyRunning | ExampleServiceUnavailable>;
    readonly state: Effect.Effect<ScenarioState>;
    readonly stop: Effect.Effect<ScenarioState, ScenarioNotRunning>;
  }
>()("groundtruth/load-generator/ScenarioController") {
  static readonly layer = Layer.effect(
    ScenarioController,
    Effect.gen(function* () {
      const checkout = yield* CheckoutClient;
      const config = yield* GeneratorConfig;
      const payments = yield* PaymentsAdmin;
      const started = yield* Clock.currentTimeMillis;
      const stateRef = yield* Ref.make(
        ScenarioState.make({
          baselineDurationMs: config.baselineDurationMs,
          blipDurationMs: config.blipDurationMs,
          failedRequests: 0,
          maxDurationMs: config.maxDurationMs,
          phase: "idle",
          rateRps: config.baselineRps,
          requested: 0,
          runId: "not-started",
          seed: config.scenarioSeed,
          startedAt: started,
          status: "idle",
          successfulRequests: 0,
          transitions: [],
          uniqueUsers: config.uniqueUsers,
        }),
      );
      const fiberRef = yield* Ref.make<Option.Option<Fiber.Fiber<void, never>>>(Option.none());
      const lock = yield* Semaphore.make(1);

      const enterPhase = (phase: ScenarioPhase) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(stateRef);
          if (current.phase === phase) return current;

          if (phase === "blip") {
            yield* payments.setFailureRate(incidentFailureRate, current.seed);
          } else if (phase === "recovery") {
            yield* payments.setFailureRate(baselineFailureRate, current.seed);
          }

          const now = yield* Clock.currentTimeMillis;
          const next = transition(current, phase, now);
          yield* Ref.set(stateRef, next);
          yield* Metric.update(scenarioPhase, phaseValues[phase]);
          yield* Effect.logInfo("Scenario phase changed").pipe(
            Effect.annotateLogs({
              elapsedMs: now - current.startedAt,
              phase,
              runId: current.runId,
              seed: current.seed,
            }),
          );
          return next;
        });

      const send = (index: number, state: ScenarioState) =>
        Effect.gen(function* () {
          const request = requestFor(index, state.seed, state.uniqueUsers);
          yield* checkout.send(request).pipe(
            Effect.matchEffect({
              onFailure: (error) =>
                Effect.gen(function* () {
                  yield* Ref.update(stateRef, (current) =>
                    ScenarioState.make({
                      ...current,
                      failedRequests: current.failedRequests + 1,
                      lastError: error.reason,
                    }),
                  );
                  if (index % 50 === 0) {
                    yield* Effect.logWarning("Generated checkout failed").pipe(
                      Effect.annotateLogs({
                        index,
                        reason: error.reason,
                        requestId: request.requestId,
                        runId: state.runId,
                      }),
                    );
                  }
                }),
              onSuccess: () =>
                Ref.update(stateRef, (current) =>
                  ScenarioState.make({
                    ...current,
                    successfulRequests: current.successfulRequests + 1,
                  }),
                ),
            }),
          );
        });

      const run = (index: number): Effect.Effect<void, ExampleServiceUnavailable> =>
        Effect.gen(function* () {
          let current = yield* Ref.get(stateRef);
          if (current.status !== "running") return;

          const now = yield* Clock.currentTimeMillis;
          const elapsedMs = now - current.startedAt;
          if (elapsedMs >= current.maxDurationMs) {
            const completed = yield* enterPhase("completed");
            yield* Ref.set(stateRef, ScenarioState.make({ ...completed, status: "completed" }));
            yield* payments
              .setFailureRate(baselineFailureRate, current.seed)
              .pipe(Effect.catch(() => Effect.void));
            return;
          }

          const desiredPhase =
            current.phase === "recovery"
              ? "recovery"
              : phaseAt(elapsedMs, current.baselineDurationMs, current.blipDurationMs);
          if (desiredPhase === "amplification" && current.phase === "baseline") {
            current = yield* enterPhase("blip");
          }
          current = yield* enterPhase(desiredPhase);
          yield* Ref.update(stateRef, (state) =>
            ScenarioState.make({ ...state, requested: state.requested + 1 }),
          );
          yield* send(index, current).pipe(Effect.forkChild);
          yield* Effect.sleep(1_000 / current.rateRps);
          return yield* Effect.suspend(() => run(index + 1));
        });

      const start = (input: ScenarioStart) =>
        lock.withPermit(
          Effect.gen(function* () {
            const currentFiber = yield* Ref.get(fiberRef);
            const current = yield* Ref.get(stateRef);
            if (Option.isSome(currentFiber)) {
              return yield* new ScenarioAlreadyRunning({
                runId: current.runId,
              });
            }

            const options = normalize(config, input);
            const now = yield* Clock.currentTimeMillis;
            yield* payments.setFailureRate(baselineFailureRate, options.seed);
            const state = ScenarioState.make({
              ...options,
              failedRequests: 0,
              phase: "baseline",
              requested: 0,
              runId: `${options.seed}-${Math.floor(now)}`,
              startedAt: now,
              status: "running",
              successfulRequests: 0,
              transitions: [
                ScenarioTransition.make({
                  at: now,
                  elapsedMs: 0,
                  phase: "baseline",
                }),
              ],
            });
            yield* Ref.set(stateRef, state);
            yield* Metric.update(configuredRate, state.rateRps);
            yield* Metric.update(configuredUsers, state.uniqueUsers);
            yield* Metric.update(scenarioPhase, phaseValues.baseline);
            yield* Effect.logInfo("Scenario started").pipe(
              Effect.annotateLogs({
                baselineDurationMs: state.baselineDurationMs,
                blipDurationMs: state.blipDurationMs,
                maxDurationMs: state.maxDurationMs,
                rateRps: state.rateRps,
                runId: state.runId,
                seed: state.seed,
                uniqueUsers: state.uniqueUsers,
              }),
            );

            const supervised = run(0).pipe(
              Effect.catch((error) =>
                Effect.gen(function* () {
                  const failedAt = yield* Clock.currentTimeMillis;
                  yield* Ref.update(stateRef, (value) =>
                    ScenarioState.make({
                      ...transition(value, "stopped", failedAt),
                      lastError: error.reason,
                      status: "stopped",
                    }),
                  );
                  yield* Effect.logError("Scenario stopped unexpectedly").pipe(
                    Effect.annotateLogs({ reason: error.reason }),
                  );
                }),
              ),
              Effect.ensuring(Ref.set(fiberRef, Option.none())),
            );
            const fiber = yield* supervised.pipe(Effect.forkDetach);
            yield* Ref.set(fiberRef, Option.some(fiber));
            return state;
          }),
        );

      const stop = lock.withPermit(
        Effect.gen(function* () {
          const fiber = yield* Ref.get(fiberRef);
          if (Option.isNone(fiber)) return yield* new ScenarioNotRunning({});
          yield* Fiber.interrupt(fiber.value);
          const now = yield* Clock.currentTimeMillis;
          const current = yield* Ref.get(stateRef);
          const stopped = ScenarioState.make({
            ...transition(current, "stopped", now),
            status: "stopped",
          });
          yield* Ref.set(stateRef, stopped);
          yield* Ref.set(fiberRef, Option.none());
          yield* payments
            .setFailureRate(baselineFailureRate, current.seed)
            .pipe(Effect.catch(() => Effect.void));
          yield* Metric.update(scenarioPhase, phaseValues.stopped);
          return stopped;
        }),
      );

      const recover = Effect.gen(function* () {
        const fiber = yield* Ref.get(fiberRef);
        if (Option.isNone(fiber)) return yield* new ScenarioNotRunning({});
        return yield* enterPhase("recovery");
      });

      return ScenarioController.of({
        recover,
        start,
        state: Ref.get(stateRef),
        stop,
      });
    }),
  );
}
