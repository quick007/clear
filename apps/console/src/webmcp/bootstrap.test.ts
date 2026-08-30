import { ConsoleAuthenticationRequired, ConsoleUnavailable } from "../errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getConsoleRuntime: vi.fn(),
  makeToolOperations: vi.fn(() => ({})),
  registryStart: vi.fn(),
  registryStop: vi.fn(),
}));

vi.mock("../api/runtime", () => ({ getConsoleRuntime: mocks.getConsoleRuntime }));
vi.mock("./operations", () => ({ makeToolOperations: mocks.makeToolOperations }));
vi.mock("./registry", () => ({
  GroundtruthToolRegistry: class {
    start = mocks.registryStart;
    stop = mocks.registryStop;
  },
}));

import { getGroundtruthToolStatus, startGroundtruthTools, stopGroundtruthTools } from "./bootstrap";

beforeEach(() => {
  stopGroundtruthTools();
  vi.useFakeTimers();
  vi.stubGlobal("document", {
    modelContext: { registerTool: vi.fn() },
  });
  mocks.getConsoleRuntime.mockReset();
  mocks.makeToolOperations.mockClear();
  mocks.registryStart.mockReset();
  mocks.registryStop.mockReset();
});

afterEach(() => {
  stopGroundtruthTools();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("WebMCP bootstrap", () => {
  it("recovers from transient runtime failures without a page reload", async () => {
    const runtime = { api: { id: "api" }, sessions: { id: "sessions" } };
    mocks.getConsoleRuntime
      .mockRejectedValueOnce(new ConsoleUnavailable({ retryable: true }))
      .mockRejectedValueOnce(new ConsoleUnavailable({ retryable: true }))
      .mockResolvedValueOnce(runtime);
    mocks.registryStart.mockResolvedValueOnce(undefined);

    const started = startGroundtruthTools();
    await vi.runAllTimersAsync();
    await expect(started).resolves.toBeUndefined();

    expect(mocks.getConsoleRuntime).toHaveBeenCalledTimes(3);
    expect(mocks.registryStart).toHaveBeenCalledOnce();
    expect(mocks.makeToolOperations).toHaveBeenCalledWith(runtime.api, runtime.sessions);
  });

  it("marks tool status failed after a non-recoverable runtime failure", async () => {
    const failure = new ConsoleAuthenticationRequired();
    mocks.getConsoleRuntime.mockRejectedValueOnce(failure);

    await expect(startGroundtruthTools()).rejects.toBe(failure);
    expect(getGroundtruthToolStatus()).toBe("failed");
    expect(mocks.getConsoleRuntime).toHaveBeenCalledOnce();
    expect(mocks.registryStart).not.toHaveBeenCalled();
  });

  it("does not return to ready after tools stop while registration is pending", async () => {
    const runtime = { api: { id: "api" }, sessions: { id: "sessions" } };
    let finishRegistration!: () => void;
    mocks.getConsoleRuntime.mockResolvedValueOnce(runtime);
    mocks.registryStart.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishRegistration = resolve;
        }),
    );

    const started = startGroundtruthTools();
    await vi.waitFor(() => expect(mocks.registryStart).toHaveBeenCalledOnce());
    stopGroundtruthTools();
    finishRegistration();
    await expect(started).resolves.toBeUndefined();

    expect(getGroundtruthToolStatus()).toBe("idle");
  });
});
