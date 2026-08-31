import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  makeBrowserApiClient: vi.fn(),
  makeToolSessionSource: vi.fn(),
}));

vi.mock("./client", () => ({ makeBrowserApiClient: mocks.makeBrowserApiClient }));
vi.mock("./session-source", () => ({ makeToolSessionSource: mocks.makeToolSessionSource }));

import { explicitDemoRequested, forceSandboxForTab, getConsoleRuntime } from "./runtime";
import { ConsoleUnexpected } from "../errors";

beforeEach(() => {
  mocks.makeBrowserApiClient.mockReset();
  mocks.makeToolSessionSource.mockReset();
});

describe("getConsoleRuntime", () => {
  it("retries after a transient bootstrap failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const api = { id: "api" };
    const sessions = { id: "sessions" };
    mocks.makeBrowserApiClient.mockRejectedValueOnce(new Error("temporary failure"));
    mocks.makeBrowserApiClient.mockResolvedValueOnce(api);
    mocks.makeToolSessionSource.mockResolvedValueOnce(sessions);

    await expect(getConsoleRuntime()).rejects.toBeInstanceOf(ConsoleUnexpected);
    await expect(getConsoleRuntime()).resolves.toEqual({ api, sessions });
    expect(mocks.makeBrowserApiClient).toHaveBeenCalledTimes(2);
    expect(mocks.makeToolSessionSource).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      "[Clear] Console runtime failed",
      expect.objectContaining({ cause: expect.any(Error) }),
    );
    consoleError.mockRestore();
  });
});

describe("explicitDemoRequested", () => {
  it("recognizes only an explicit demo query", () => {
    expect(explicitDemoRequested("?demo=true&guide=true")).toBe(true);
    expect(explicitDemoRequested("?demo=false&guide=true")).toBe(false);
    expect(explicitDemoRequested("?guide=true")).toBe(false);
  });

  it("keeps an explicitly requested demo isolated for the life of its tab", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(forceSandboxForTab("?demo=true&guide=true", storage)).toBe(true);
    expect(forceSandboxForTab("?guide=true", storage)).toBe(true);
    expect(forceSandboxForTab("?hosted=true", storage)).toBe(false);
    expect(forceSandboxForTab("", storage)).toBe(false);
  });
});
