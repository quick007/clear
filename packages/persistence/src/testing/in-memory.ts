import { Effect, Layer, Ref } from "effect";
import { IdGenerator, IdGeneratorLive } from "../ids.ts";
import { NodeCryptoLive } from "../node-crypto.ts";
import { makeAuthRepositoriesMemory } from "./in-memory-auth.ts";
import { makeBoardRepositoriesMemory } from "./in-memory-boards.ts";
import { makeCoreRepositoriesMemory } from "./in-memory-core.ts";
import { makeIncidentRepositoriesMemory } from "./in-memory-incidents.ts";
import { makeManualAlertRepositoryMemory } from "./in-memory-manual-alerts.ts";
import {
  emptyRepositoriesMemoryState,
  makeRepositoriesMemoryControl,
  RepositoriesMemoryControl,
} from "./in-memory-state.ts";
import { InMemoryTelemetryRepositoryLive } from "./in-memory-telemetry.ts";

const IdentifiersMemory = IdGeneratorLive.pipe(Layer.provide(NodeCryptoLive));

const ProductRepositoriesMemory = Layer.unwrap(
  Effect.gen(function* () {
    const ids = yield* IdGenerator;
    const state = yield* Ref.make(emptyRepositoriesMemoryState());
    return Layer.mergeAll(
      makeCoreRepositoriesMemory(state, ids),
      makeAuthRepositoriesMemory(state, ids),
      makeBoardRepositoriesMemory(state, ids),
      makeIncidentRepositoriesMemory(state, ids),
      makeManualAlertRepositoryMemory(state, ids),
      Layer.succeed(RepositoriesMemoryControl, makeRepositoriesMemoryControl(state)),
    );
  }),
).pipe(Layer.provide(IdentifiersMemory));

export const RepositoriesMemory = Layer.mergeAll(
  ProductRepositoriesMemory,
  InMemoryTelemetryRepositoryLive,
);

export const PersistenceMemory = RepositoriesMemory;

export * from "./in-memory-state.ts";
export * from "./in-memory-telemetry.ts";
