import type { ToolSessionSnapshot, ToolSessionSource } from "../api/session-source";
import type { GroundtruthToolOperations } from "./operations";
import { makeAlwaysTools } from "./always-tools";
import { makeIncidentTools } from "./incident-tools";
import { makeSandboxTools } from "./sandbox-tools";
import type { PreparedTool } from "./tool-contract";

export interface ModelContextTarget {
  readonly registerTool: (
    tool: WebMCP.ModelContextTool,
    options?: WebMCP.ModelContextRegisterToolOptions,
  ) => Promise<void>;
}

const registerScope = async (
  modelContext: ModelContextTarget,
  tools: ReadonlyArray<PreparedTool>,
  controller: AbortController,
) => {
  try {
    await Promise.all(
      tools.map((tool) =>
        modelContext.registerTool(tool.definition(), { signal: controller.signal }),
      ),
    );
  } catch (error) {
    controller.abort();
    throw error;
  }
};

export class GroundtruthToolRegistry {
  readonly #modelContext: ModelContextTarget;
  readonly #sessions: ToolSessionSource;
  readonly #operations: GroundtruthToolOperations;
  #sessionController: AbortController | null = null;
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
    const sessionController = new AbortController();
    this.#sessionController = sessionController;
    try {
      await registerScope(this.#modelContext, makeAlwaysTools(this.#operations), sessionController);
      if (!this.#isActive(generation)) return;
      this.#unsubscribe = this.#sessions.subscribe((snapshot) => {
        this.#enqueue(snapshot, generation);
      });
      this.#reconciliation = this.#reconcile(this.#sessions.getSnapshot(), generation);
      await this.#reconciliation;
    } catch (error) {
      if (this.#generation === generation) this.#deactivate();
      throw error;
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
      if (this.#isActive(generation)) {
        console.warn("Clear site tool scope could not update", error);
      }
    });
  }

  async #reconcile(snapshot: ToolSessionSnapshot, generation: number) {
    if (!this.#isActive(generation)) return;
    if (snapshot.mode === "sandbox" && this.#sandboxController === null) {
      const controller = new AbortController();
      await registerScope(this.#modelContext, makeSandboxTools(this.#operations), controller);
      if (!this.#isActive(generation)) {
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
      const controller = new AbortController();
      await registerScope(this.#modelContext, makeIncidentTools(this.#operations), controller);
      if (!this.#isActive(generation)) {
        controller.abort();
        return;
      }
      this.#incidentController = controller;
      this.#incidentId = nextIncidentId;
    }
  }
}
