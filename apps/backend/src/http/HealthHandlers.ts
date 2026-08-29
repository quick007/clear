import { GroundtruthApi, HealthResponse } from "@groundtruth/api-contract";
import { ProjectRepository, TelemetryRepository } from "@groundtruth/persistence";
import { DateTime, Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { sandboxProjectId, sandboxUserId } from "../memory/SeedIds.js";

const probe = (effect: Effect.Effect<unknown, unknown>) =>
  effect.pipe(
    Effect.as("healthy" as const),
    Effect.catch(() => Effect.succeed("unavailable" as const)),
  );

export const HealthHandlers = HttpApiBuilder.group(
  GroundtruthApi,
  "health",
  Effect.fn(function* (handlers) {
    const projects = yield* ProjectRepository;
    const telemetry = yield* TelemetryRepository;

    return handlers.handle("check", () =>
      Effect.gen(function* () {
        const checkedAt = yield* DateTime.now;
        const dependencies = yield* Effect.all(
          {
            postgres: probe(projects.listForOwner(sandboxUserId)),
            clickhouse: probe(telemetry.listMetrics(sandboxProjectId)),
          },
          { concurrency: "unbounded" },
        );
        const response = new HealthResponse({
          status:
            dependencies.postgres === "healthy" && dependencies.clickhouse === "healthy"
              ? "healthy"
              : "degraded",
          version: "0.0.0",
          checkedAt,
          dependencies,
        });
        return response.status === "healthy" ? response : yield* Effect.fail(response);
      }),
    );
  }),
);
