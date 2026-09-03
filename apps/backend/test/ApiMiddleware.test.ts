import { assert, describe, it } from "@effect/vitest";
import { SandboxState, ServiceUnavailable, Unauthorized } from "@groundtruth/api-contract";
import { EntityNotFound, SandboxSession, SessionId } from "@groundtruth/domain";
import { TelemetryUnavailable } from "@groundtruth/telemetry";
import { DateTime, Effect, Redacted } from "effect";
import { resumeSandboxSession } from "../src/http/ApiMiddleware.js";
import { SandboxService } from "../src/sandbox/SandboxService.js";

const activeSessionId = SessionId.make("01993f71-0001-7000-8000-000000000071");
const unknownSessionId = SessionId.make("01993f71-0001-7000-8000-000000000072");
const createdAt = DateTime.fromDateUnsafe(new Date("2026-08-28T07:00:00.000Z"));
const activeSession = new SandboxSession({
  id: activeSessionId,
  seed: 71,
  createdAt,
  expiresAt: DateTime.addDuration(createdAt, "2 hours"),
});
const activeState = new SandboxState({
  session: activeSession,
  phase: "baseline",
  changed: false,
  occurredAt: createdAt,
});

const notUsed = () => Effect.die("Unexpected sandbox operation");

const sandboxes = SandboxService.of({
  open: notUsed,
  ensure: notUsed,
  resume: (sessionId) =>
    sessionId === activeSessionId
      ? Effect.succeed(activeState)
      : Effect.fail(
          new EntityNotFound({
            entity: "session",
            id: sessionId,
            message: "Sandbox session not found or expired",
          }),
        ),
  resumeOrOpen: notUsed,
  trigger: notUsed,
  recover: notUsed,
  resolve: notUsed,
  reset: notUsed,
  advanceActive: notUsed,
  pruneExpired: notUsed,
});

const unavailableSandboxes = SandboxService.of({
  open: (seed) => sandboxes.open(seed),
  ensure: (session) => sandboxes.ensure(session),
  resume: () =>
    Effect.fail(
      new TelemetryUnavailable({
        operation: "resume sandbox",
        retryable: true,
        message: "Telemetry storage is unavailable",
      }),
    ),
  resumeOrOpen: (session, seed) => sandboxes.resumeOrOpen(session, seed),
  trigger: (sessionId) => sandboxes.trigger(sessionId),
  recover: (sessionId) => sandboxes.recover(sessionId),
  resolve: (sessionId) => sandboxes.resolve(sessionId),
  reset: (sessionId) => sandboxes.reset(sessionId),
  advanceActive: () => sandboxes.advanceActive(),
  pruneExpired: () => sandboxes.pruneExpired(),
});

describe("sandbox request authentication", () => {
  it.effect("resumes an active server session", () =>
    Effect.gen(function* () {
      const session = yield* resumeSandboxSession(
        sandboxes,
        Redacted.make(String(activeSessionId)),
      );
      assert.strictEqual(session, activeSession);
    }),
  );

  it.effect("rejects a valid UUID that was never opened", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resumeSandboxSession(sandboxes, Redacted.make(String(unknownSessionId))),
      );
      assert(error instanceof Unauthorized);
      assert.strictEqual(error.message, "Sandbox session is invalid or expired");
    }),
  );

  it.effect("rejects malformed session credentials before lookup", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resumeSandboxSession(sandboxes, Redacted.make("not-a-session")),
      );
      assert(error instanceof Unauthorized);
      assert.strictEqual(error.message, "Sandbox session is missing or malformed");
    }),
  );

  it.effect("preserves sandbox dependency failures as service unavailable", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resumeSandboxSession(unavailableSandboxes, Redacted.make(String(activeSessionId))),
      );
      assert(error instanceof ServiceUnavailable);
      assert.strictEqual(error.service, "telemetry");
    }),
  );
});
