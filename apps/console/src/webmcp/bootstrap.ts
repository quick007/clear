import { getConsoleRuntime } from "../api/runtime";
import { makeToolOperations } from "./operations";
import { GroundtruthToolRegistry } from "./registry";

let registry: GroundtruthToolRegistry | null = null;
let bootstrap: Promise<void> | null = null;
let generation = 0;

export const startGroundtruthTools = () => {
  if (bootstrap !== null) return bootstrap;
  if (registry !== null) return Promise.resolve();
  const currentGeneration = generation + 1;
  generation = currentGeneration;
  const attempt = (async () => {
    const modelContext = document.modelContext;
    if (typeof modelContext?.registerTool !== "function") return;

    const { api, sessions } = await getConsoleRuntime();
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
