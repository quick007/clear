import type { GroundtruthToolOperations } from "./operations";
import { NoInput } from "./schemas";
import { tool } from "./tool-contract";

export const makeSandboxTools = (operations: GroundtruthToolOperations) =>
  [
    tool({
      name: "start_sandbox_incident",
      title: "Start sandbox incident",
      description:
        "Starts a deterministic incident with elevated checkout latency and errors. This control affects only the isolated sandbox session and is safe to repeat.",
      input: NoInput,
      readOnly: false,
      returnsUntrustedContent: false,
      invoke: (_, signal) => operations.triggerSandboxIncident(signal),
      successHint: "Call get_console_overview, then investigate the firing alerts.",
      failureHint: "This control is available only in sandbox mode. Reset the sandbox if needed.",
    }),
    tool({
      name: "reset_sandbox",
      title: "Reset sandbox",
      description:
        "Resets the isolated sandbox to a clean baseline so the incident investigation can be repeated from the beginning.",
      input: NoInput,
      readOnly: false,
      returnsUntrustedContent: false,
      invoke: (_, signal) => operations.resetSandbox(signal),
      successHint: "Trigger the incident when ready to investigate again.",
      failureHint: "This control is available only in sandbox mode.",
    }),
  ] as const;
