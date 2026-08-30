import { Duration, Effect, Schedule } from "effect";
import type { ToolSessionSnapshot, ToolSessionSource } from "../api/session-source";
import type { GroundtruthToolOperations } from "./operations";
import { makeAlwaysTools } from "./always-tools";
import {
  isWebMcpRegistrationFailure,
  normalizeRegistrationFailure,
  reportRegistrationFailure,
  type ToolRegistrationScope,
} from "./failures";
import { makeIncidentTools } from "./incident-tools";
import { makeSandboxTools } from "./sandbox-tools";
import type { PreparedTool } from "./tool-contract";

export interface ModelContextTarget {
  readonly registerTool: (
    tool: WebMCP.ModelContextTool,
    options?: WebMCP.ModelContextRegisterToolOptions,
  ) => Promise<void>;
}

const registerScope = (
  modelContext: ModelContextTarget,
  tools: ReadonlyArray<PreparedTool>,
  scope: ToolRegistrationScope,
  lifecycleSignal: AbortSignal,
) => {
  const registrationRetryDelay = 200; // 200 milliseconds
  const registrationRetryCount = 4;
  const retrySchedule = Schedule.exponential(Duration.millis(registrationRetryDelay)).pipe(
    Schedule.upTo({ times: registrationRetryCount }),
  );

  const attempt = Effect.suspend(() => {
    const controller = new AbortController();
    const abort = () => controller.abort(lifecycleSignal.reason);
    lifecycleSignal.addEventListener("abort", abort, { once: true });
    if (lifecycleSignal.aborted) abort();

    return Effect.tryPromise({
      try: () =>
        Promise.all(
          tools.map((tool) =>
            modelContext.registerTool(tool.definition(controller.signal), {
              signal: controller.signal,
            }),
          ),
        ),
      catch: (cause) => normalizeRegistrationFailure(scope, cause),
    }).pipe(
      Effect.as(controller),
      Effect.onError(() => Effect.sync(() => controller.abort())),
      Effect.ensuring(Effect.sync(() => lifecycleSignal.removeEventListener("abort", abort))),
    );
  });

  return attempt.pipe(
    Effect.tapError((failure) =>
      lifecycleSignal.aborted ? Effect.succeed(undefined) : reportRegistrationFailure(failure),
    ),
    Effect.retry({
      schedule: retrySchedule,
      while: () => !lifecycleSignal.aborted,
    }),
  );
};

const observeRegistrationFailure = (scope: ToolRegistrationScope, cause: unknown) => {
  const failure = normalizeRegistrationFailure(scope, cause);
  Effect.runSync(reportRegistrationFailure(failure));
  return failure;
};

export class GroundtruthToolRegistry {
  readonly #modelContext: ModelContextTarget;
  readonly #sessions: ToolSessionSource;
  readonly #operations: GroundtruthToolOperations;
  #sessionController: AbortController | null = null;
  #lifecycleController: AbortController | null = null;
  #sandboxController: AbortController | null = null;
  #incidentController: AbortController | null = null;
  #incidentId: string | null = null;
  #unsubscribe: (() => void) | null = null;
  #reconciliation = Promise.resolve();
  #generation = 0;
  #started = false;

  constructor(options: {
    readonly modelContext: ModelContextTarget;
    readonly sessions: ToolSessionSource;
    readonly operations: GroundtruthToolOperations;
  }) {
    this.#modelContext = options.modelContext;
    this.#sessions = options.sessions;
    this.#operations = options.operations;
  }

  async start() {
    if (this.#started) return;
    const generation = this.#generation + 1;
    this.#generation = generation;
    this.#started = true;
    const lifecycleController = new AbortController();
    this.#lifecycleController = lifecycleController;
    try {
      const sessionController = await Effect.runPromise(
        registerScope(
          this.#modelContext,
          makeAlwaysTools(this.#operations),
          "session",
          lifecycleController.signal,
        ),
      );
      if (!this.#isActive(generation)) {
        sessionController.abort();
        return;
      }
      this.#sessionController = sessionController;
      this.#unsubscribe = this.#sessions.subscribe((snapshot) => {
        this.#enqueue(snapshot, generation);
      });
      this.#reconciliation = this.#reconcile(this.#sessions.getSnapshot(), generation);
      await this.#reconciliation;
    } catch (error) {
      if (this.#generation !== generation) return;
      const failure = isWebMcpRegistrationFailure(error)
        ? error
        : observeRegistrationFailure("session", error);
      this.#deactivate();
      throw failure;
    }
  }

  stop() {
    this.#generation += 1;
    this.#deactivate();
    this.#reconciliation = Promise.resolve();
  }

  #deactivate() {
    this.#started = false;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#lifecycleController?.abort();
    this.#lifecycleController = null;
    this.#sessionController?.abort();
    this.#sessionController = null;
    this.#sandboxController?.abort();
    this.#sandboxController = null;
    this.#incidentController?.abort();
    this.#incidentController = null;
    this.#incidentId = null;
  }

  #isActive(generation: number) {
    return this.#started && this.#generation === generation;
  }

  #enqueue(snapshot: ToolSessionSnapshot, generation: number) {
    const reconcile = () => this.#reconcile(snapshot, generation);
    this.#reconciliation = this.#reconciliation.then(reconcile, reconcile).catch((error) => {
      if (this.#isActive(generation) && !isWebMcpRegistrationFailure(error)) {
        observeRegistrationFailure("reconciliation", error);
      }
    });
  }

  #snapshotIsCurrent(snapshot: ToolSessionSnapshot) {
    const current = this.#sessions.getSnapshot();
    return (
      current.projectId === snapshot.projectId &&
      current.mode === snapshot.mode &&
      current.incident?.id === snapshot.incident?.id
    );
  }

  async #reconcile(snapshot: ToolSessionSnapshot, generation: number) {
    const lifecycleController = this.#lifecycleController;
    if (
      !this.#isActive(generation) ||
      lifecycleController === null ||
      !this.#snapshotIsCurrent(snapshot)
    ) {
      return;
    }
    if (snapshot.mode === "sandbox" && this.#sandboxController === null) {
      const controller = await Effect.runPromise(
        registerScope(
          this.#modelContext,
          makeSandboxTools(this.#operations),
          "sandbox",
          lifecycleController.signal,
        ),
      );
      if (!this.#isActive(generation) || !this.#snapshotIsCurrent(snapshot)) {
        controller.abort();
        return;
      }
      this.#sandboxController = controller;
    } else if (snapshot.mode !== "sandbox" && this.#sandboxController !== null) {
      this.#sandboxController.abort();
      this.#sandboxController = null;
    }

    const nextIncidentId = snapshot.incident?.id ?? null;
    if (nextIncidentId === this.#incidentId) return;

    this.#incidentController?.abort();
    this.#incidentController = null;
    this.#incidentId = null;

    if (nextIncidentId !== null) {
      const controller = await Effect.runPromise(
        registerScope(
          this.#modelContext,
          makeIncidentTools(this.#operations),
          "incident",
          lifecycleController.signal,
        ),
      );
      if (!this.#isActive(generation) || !this.#snapshotIsCurrent(snapshot)) {
        controller.abort();
        return;
      }
      this.#incidentController = controller;
      this.#incidentId = nextIncidentId;
    }
  }
}
