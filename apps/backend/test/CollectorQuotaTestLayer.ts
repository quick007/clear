import { Effect, Layer } from "effect";
import { AlertEvaluator } from "../src/alerts/AlertEvaluator.js";
import { CollectorQuotaService } from "../src/telemetry/CollectorQuotaService.js";

export const CollectorQuotaUnlimited = Layer.merge(
  Layer.succeed(
    CollectorQuotaService,
    CollectorQuotaService.of({
      admitRequest: (projectId) =>
        Effect.succeed({ projectId, maxActiveSeries: Number.MAX_SAFE_INTEGER }),
      admitSeries: () => Effect.void,
      pruneStale: () => Effect.succeed({ projectsRemoved: 0, seriesRemoved: 0 }),
    }),
  ),
  Layer.succeed(
    AlertEvaluator,
    AlertEvaluator.of({
      trackProject: () => Effect.void,
      evaluateProject: (projectId) =>
        Effect.succeed({
          projectId,
          scanned: 0,
          failed: 0,
          noData: 0,
          skipped: 0,
          stable: 0,
          transitioned: 0,
        }),
      evaluateTracked: () => Effect.succeed([]),
    }),
  ),
);

export const testWireBytes = 1;
