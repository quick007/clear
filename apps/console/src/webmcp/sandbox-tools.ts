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
      name: "simulate_fix_deploy",
      title: "Simulate fix deployment",
      description:
        "Records a synthetic checkout-api deploy and starts recovery telemetry in this isolated sandbox. Use only after the evidence supports retry amplification. In a real project, the user's own agent deploys through its existing repository and infrastructure access.",
      input: NoInput,
      readOnly: false,
      returnsUntrustedContent: false,
      invoke: (_, signal) => operations.simulateSandboxRecovery(signal),
      successHint: "Watch the live request and latency signals recover, then close the incident.",
      failureHint: "Start and investigate the sandbox incident before simulating its fix deploy.",
    }),
    tool({
      name: "resolve_sandbox_incident",
      title: "Resolve sandbox incident",
      description:
        "Applies the simulated retry-policy fix, normalizes retry traffic, and closes the active incident. This action is available only in the isolated sandbox and never changes a real project or deployment.",
      input: NoInput,
      readOnly: false,
      returnsUntrustedContent: false,
      invoke: (_, signal) => operations.resolveSandboxIncident(signal),
      successHint:
        "Tell the user the issue is fixed. Retry traffic has returned to normal and the sandbox incident is resolved.",
      failureHint: "Start the sandbox incident and wait for its alert to fire before resolving it.",
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
