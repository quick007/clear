import { CurrentSession, GroundtruthApi, ServiceUnavailable } from "@groundtruth/api-contract";
import { EntityNotFound } from "@groundtruth/domain";
import type { TelemetryUnavailable } from "@groundtruth/telemetry";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { SandboxService } from "../sandbox/SandboxService.js";

const unavailable = (error: TelemetryUnavailable) =>
  new ServiceUnavailable({ service: "telemetry", message: error.message });

const currentSandboxSession = Effect.fn("SandboxHandlers.currentSandboxSession")(function* () {
  const session = yield* CurrentSession;
  if (session._tag !== "sandbox") {
    return yield* new EntityNotFound({
      entity: "session",
      id: session.id,
      message: "Sandbox session not found",
    });
  }
  return session;
});

export const SandboxHandlers = HttpApiBuilder.group(
  GroundtruthApi,
  "sandbox",
  Effect.fn(function* (handlers) {
    const sandboxes = yield* SandboxService;

    return handlers
      .handle("createSession", () =>
        sandboxes.open().pipe(Effect.catchTag("TelemetryUnavailable", unavailable)),
      )
      .handle(
        "triggerIncident",
        Effect.fn(function* () {
          const session = yield* currentSandboxSession();
          return yield* sandboxes
            .trigger(session.id)
            .pipe(Effect.catchTag("TelemetryUnavailable", unavailable));
        }),
      )
      .handle(
        "simulateRecovery",
        Effect.fn(function* () {
          const session = yield* currentSandboxSession();
          return yield* sandboxes
            .recover(session.id)
            .pipe(Effect.catchTag("TelemetryUnavailable", unavailable));
        }),
      )
      .handle(
        "reset",
        Effect.fn(function* () {
          const session = yield* currentSandboxSession();
          return yield* sandboxes
            .reset(session.id)
            .pipe(Effect.catchTag("TelemetryUnavailable", unavailable));
        }),
      );
  }),
);
