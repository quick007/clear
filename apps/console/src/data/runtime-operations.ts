import { Effect } from "effect";

import { getConsoleRuntime } from "../api/runtime";
import { normalizeConsoleEffect, normalizeConsoleMutationEffect } from "../errors";

type ConsoleRuntime = Awaited<ReturnType<typeof getConsoleRuntime>>;

export const refreshInBackground = (refresh: (signal: AbortSignal) => Promise<unknown>) => {
  Effect.runFork(
    Effect.tryPromise({ try: refresh, catch: (cause) => cause }).pipe(
      normalizeConsoleEffect("View refresh failed"),
      Effect.catch((failure) =>
        Effect.sync(() => console.warn("Clear view refresh failed", failure._tag)),
      ),
    ),
  );
};

export const runGroundtruthQuery = async <A, E>(
  operation: (runtime: ConsoleRuntime) => Effect.Effect<A, E>,
  signal?: AbortSignal,
) => {
  const runtime = await getConsoleRuntime();
  return runtime.api.run(operation(runtime), signal);
};

export const runGroundtruthMutation = async <A, E>(
  context: string,
  operation: (runtime: ConsoleRuntime) => Effect.Effect<A, E>,
) => {
  const runtime = await getConsoleRuntime();
  return runtime.api.run(
    operation(runtime).pipe(normalizeConsoleMutationEffect(`${context} failed`)),
  );
};
