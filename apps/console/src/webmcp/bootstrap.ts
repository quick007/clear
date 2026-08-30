import { Duration, Effect, Schedule } from "effect";
import { getConsoleRuntime } from "../api/runtime";
import { normalizeConsoleFailure } from "../errors";
import { makeToolOperations } from "./operations";
import { GroundtruthToolRegistry } from "./registry";

let registry: GroundtruthToolRegistry | null = null;
let bootstrap: Promise<void> | null = null;
let generation = 0;

const runtimeRetryDelay = 250; // 250 milliseconds
const runtimeRetryCount = 5;
const runtimeRetrySchedule = Schedule.exponential(Duration.millis(runtimeRetryDelay)).pipe(
  Schedule.upTo({ times: runtimeRetryCount }),
);

const runtimeFailureIsRetryable = (cause: unknown) => {
  const failure = normalizeConsoleFailure(cause);
  return (
    failure._tag === "ConsoleInvalidResponse" ||
    failure._tag === "ConsoleUnexpected" ||
    (failure._tag === "ConsoleUnavailable" && failure.retryable)
  );
};

const loadRuntime = (currentGeneration: number) =>
  Effect.suspend(() =>
    generation !== currentGeneration
      ? Effect.succeed(null)
      : Effect.tryPromise({
          try: () => getConsoleRuntime(),
          catch: normalizeConsoleFailure,
        }),
  ).pipe(
    Effect.retry({
      schedule: runtimeRetrySchedule,
      while: (failure) => generation === currentGeneration && runtimeFailureIsRetryable(failure),
    }),
  );

export const startGroundtruthTools = () => {
  if (bootstrap !== null) return bootstrap;
  if (registry !== null) return Promise.resolve();
  const currentGeneration = generation + 1;
  generation = currentGeneration;
  const attempt = (async () => {
    const modelContext = document.modelContext;
    if (typeof modelContext?.registerTool !== "function") return;

    const runtime = await Effect.runPromise(loadRuntime(currentGeneration));
    if (runtime === null) return;
    const { api, sessions } = runtime;
    if (generation !== currentGeneration) return;
    const nextRegistry = new GroundtruthToolRegistry({
      modelContext,
      sessions,
      operations: makeToolOperations(api, sessions),
    });
    registry = nextRegistry;
    try {
      await nextRegistry.start();
      if (generation !== currentGeneration) nextRegistry.stop();
    } catch (error) {
      nextRegistry.stop();
      if (registry === nextRegistry) registry = null;
      throw error;
    } finally {
      if (generation !== currentGeneration && registry === nextRegistry) registry = null;
    }
  })();
  bootstrap = attempt;
  const clearAttempt = () => {
    if (bootstrap === attempt) bootstrap = null;
  };
  void attempt.then(clearAttempt, clearAttempt);
  return attempt;
};

export const stopGroundtruthTools = () => {
  generation += 1;
  registry?.stop();
  registry = null;
  bootstrap = null;
};
