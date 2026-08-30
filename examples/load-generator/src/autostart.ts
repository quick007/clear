import { Effect, Layer } from "effect";
import { GeneratorConfig } from "./config.js";
import { ScenarioStart } from "./contracts.js";
import { ScenarioController } from "./scenario-controller.js";

export const AutostartLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* GeneratorConfig;
    if (!config.autostart) return;

    const controller = yield* ScenarioController;
    yield* controller.start(ScenarioStart.make({}));
  }).pipe(
    Effect.catch((error) =>
      Effect.logError("Scenario autostart failed").pipe(
        Effect.annotateLogs({ error: String(error) }),
      ),
    ),
  ),
);
