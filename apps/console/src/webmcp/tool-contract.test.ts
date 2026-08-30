import { ConsoleNotFound, ConsoleRateLimited, ConsoleUnavailable } from "../errors";
import { Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { NoActiveIncident } from "./failures";
import { tool } from "./tool-contract";

const makeTool = (
  invoke: (input: { readonly query: string }, signal: AbortSignal) => Promise<unknown>,
  afterSuccess?: (value: unknown, signal: AbortSignal) => PromiseLike<unknown> | void,
  options: { readonly lifecycleSignal?: AbortSignal; readonly readOnly?: boolean } = {},
) =>
  tool({
    name: "inspect_data",
    title: "Inspect data",
    description: "Inspects one bounded slice of telemetry.",
    input: Schema.Struct({ query: Schema.String }),
    readOnly: options.readOnly ?? true,
    returnsUntrustedContent: true,
    invoke,
    afterSuccess,
    failureHint: "Check the query and try again.",
  }).definition(options.lifecycleSignal);

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("WebMCP tool failure boundary", () => {
  it("returns actionable schema failures without exposing parser diagnostics", async () => {
    const execute = makeTool(async () => ({ records: [] }));

    const result = await execute.execute({ query: 42 } as never, {
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVALID_TOOL_INPUT",
        message:
          "The input does not match this tool's declared schema. Check field names, value types, and allowed values.",
        retryable: false,
      },
      hint: "Check the query and try again.",
    });
  });

  it("keeps arbitrary exception details out of the agent response", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const execute = makeTool(async () => {
      throw new Error("postgres://operator:secret@internal.example/clear");
    });

    const result = await execute.execute(
      { query: "errors" },
      { signal: new AbortController().signal },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "ConsoleUnexpected",
        message: "Clear could not complete the tool request. Try again in a moment.",
        retryable: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("operator:secret");
    expect(report).toHaveBeenCalledWith(
      "[Clear] Site tool inspect_data failed",
      expect.objectContaining({ cause: expect.any(Error) }),
    );
  });

  it("preserves safe typed failures and the tool-specific recovery hint", async () => {
    const execute = makeTool(async () => {
      throw new ConsoleNotFound({ resource: "trace" });
    });

    const result = await execute.execute(
      { query: "trace-1" },
      { signal: new AbortController().signal },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "ConsoleNotFound",
        message: "This trace is no longer available. Read the current state before retrying.",
        retryable: false,
      },
      hint: "Check the query and try again.",
    });
  });

  it("preserves a typed service failure's retryability", async () => {
    const execute = makeTool(async () => {
      throw new ConsoleUnavailable({ retryable: false });
    });

    const result = await execute.execute(
      { query: "traces" },
      { signal: new AbortController().signal },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "ConsoleUnavailable", retryable: false },
    });
  });

  it("does not encourage blind retries when a write outcome is unknown", async () => {
    const execute = makeTool(
      async () => {
        throw new ConsoleUnavailable({ retryable: true });
      },
      undefined,
      { readOnly: false },
    );

    const result = await execute.execute(
      { query: "annotate" },
      { signal: new AbortController().signal },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "ConsoleUnavailable",
        message:
          "Clear did not confirm whether the change completed. Read the current state before deciding whether another write is needed.",
        retryable: false,
      },
      hint: "The change may already be present. Read the current state before deciding whether to retry. Check the query and try again.",
    });
  });

  it("tells the agent to wait before retrying a rate limit", async () => {
    const execute = makeTool(async () => {
      throw new ConsoleRateLimited();
    });

    const result = await execute.execute(
      { query: "traces" },
      { signal: new AbortController().signal },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "ConsoleRateLimited",
        message: "Clear is receiving too many requests. Wait before trying again.",
        retryable: true,
      },
    });
  });

  it("represents missing incident state as a typed non-retryable failure", async () => {
    const execute = makeTool(async () => {
      throw new NoActiveIncident();
    });

    const result = await execute.execute(
      { query: "timeline" },
      { signal: new AbortController().signal },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "NO_ACTIVE_INCIDENT",
        message: "No incident is currently open.",
        retryable: false,
      },
    });
  });

  it("reports follow-up refresh failures without changing a successful result", async () => {
    vi.useFakeTimers();
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const execute = makeTool(
      async () => ({ records: [] }),
      async () => {
        throw new Error("private refresh diagnostic");
      },
    );

    const result = await execute.execute(
      { query: "errors" },
      { signal: new AbortController().signal },
    );
    expect(result).toMatchObject({ ok: true });

    await vi.runAllTimersAsync();
    expect(report).toHaveBeenCalledWith(
      "[Clear] Site tool inspect_data could not refresh state",
      expect.objectContaining({ cause: expect.any(Error) }),
    );
  });

  it("retries a transient follow-up until tool scope state converges", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let attempts = 0;
    const execute = makeTool(
      async () => ({ records: [] }),
      async () => {
        attempts += 1;
        if (attempts < 3) throw new ConsoleUnavailable({ retryable: true });
      },
    );

    const result = await execute.execute(
      { query: "errors" },
      { signal: new AbortController().signal },
    );
    expect(result).toMatchObject({ ok: true });

    await vi.runAllTimersAsync();
    expect(attempts).toBe(3);
  });

  it("cancels follow-up retries when the registered tool scope ends", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lifecycle = new AbortController();
    let attempts = 0;
    const execute = makeTool(
      async () => ({ records: [] }),
      async () => {
        attempts += 1;
        throw new ConsoleUnavailable({ retryable: true });
      },
      { lifecycleSignal: lifecycle.signal },
    );

    await execute.execute({ query: "errors" }, { signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toBe(1);

    lifecycle.abort();
    await vi.runAllTimersAsync();
    expect(attempts).toBe(1);
  });

  it("contains formatter defects behind the same safe boundary", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const execute = tool({
      name: "format_data",
      title: "Format data",
      description: "Formats telemetry for the agent.",
      input: Schema.Struct({}),
      readOnly: true,
      returnsUntrustedContent: true,
      invoke: async () => ({ records: [] }),
      format: () => {
        throw new Error("private formatter diagnostic");
      },
      failureHint: "Retry the request.",
    }).definition();

    const result = await execute.execute({}, { signal: new AbortController().signal });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "ConsoleUnexpected" },
    });
    expect(JSON.stringify(result)).not.toContain("formatter diagnostic");
    expect(report).toHaveBeenCalledWith(
      "[Clear] Site tool format_data failed",
      expect.objectContaining({ cause: expect.any(Error) }),
    );
  });

  it("propagates host cancellation instead of returning an error envelope", async () => {
    const controller = new AbortController();
    let operationStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      operationStarted = resolve;
    });
    const execute = makeTool(
      (_, signal) =>
        new Promise((_resolve, reject) => {
          operationStarted();
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );

    const pending = Promise.resolve(
      execute.execute({ query: "errors" }, { signal: controller.signal }),
    );
    await started;
    const reason = new Error("host cancelled tool execution");
    controller.abort(reason);

    const outcome = await pending.then(
      (value) => ({ _tag: "Result" as const, value }),
      (error: unknown) => ({ _tag: "Cancelled" as const, error }),
    );
    expect(outcome).toEqual({ _tag: "Cancelled", error: reason });
  });
});
