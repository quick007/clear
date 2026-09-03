import { describe, expect, it } from "vite-plus/test";

import type { GroundtruthToolOperations } from "./operations";
import { makeSandboxTools } from "./sandbox-tools";

const operations = new Proxy(
  {},
  {
    get: () => async () => undefined,
  },
) as GroundtruthToolOperations;

describe("sandbox tools", () => {
  it("describes observed symptoms without revealing the incident cause", () => {
    const startIncident = makeSandboxTools(operations).find(
      (entry) => entry.name === "start_sandbox_incident",
    );
    const description = startIncident?.definition().description ?? "";

    expect(description).toContain("checkout latency and errors");
    expect(description).toContain("isolated sandbox session");
    expect(description).not.toMatch(/retry|amplification/i);
  });

  it("accepts browser invocations that omit the optional execution context", async () => {
    let receivedSignal: AbortSignal | undefined;
    const signalOperations = new Proxy(
      {},
      {
        get: (_, property) => {
          if (property === "triggerSandboxIncident") {
            return async (signal: AbortSignal) => {
              receivedSignal = signal;
            };
          }
          return async () => undefined;
        },
      },
    ) as GroundtruthToolOperations;
    const startIncident = makeSandboxTools(signalOperations).find(
      (entry) => entry.name === "start_sandbox_incident",
    );
    const definition = startIncident?.definition();
    if (definition === undefined) throw new Error("start_sandbox_incident was not prepared");

    const result = await Reflect.apply(definition.execute, undefined, [{}]);

    expect(result).toMatchObject({ ok: true });
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal?.aborted).toBe(false);
  });

  it("makes the one-step resolution explicit and sandbox-only", () => {
    const resolveIncident = makeSandboxTools(operations).find(
      (entry) => entry.name === "resolve_sandbox_incident",
    );
    const definition = resolveIncident?.definition();

    expect(definition?.description).toContain("normalizes retry traffic");
    expect(definition?.description).toContain("only in the isolated sandbox");
    expect(definition?.description).toContain("never changes a real project");
  });

  it("instructs the agent to report a successful sandbox resolution", async () => {
    const resolveIncident = makeSandboxTools(operations).find(
      (entry) => entry.name === "resolve_sandbox_incident",
    );
    const definition = resolveIncident?.definition();
    if (definition === undefined) throw new Error("resolve_sandbox_incident was not prepared");

    const result = await Reflect.apply(definition.execute, undefined, [{}]);

    expect(result).toMatchObject({
      ok: true,
      hint: expect.stringContaining("Tell the user the issue is fixed"),
    });
  });
});
