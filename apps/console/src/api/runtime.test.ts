import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  makeBrowserApiClient: vi.fn(),
  makeToolSessionSource: vi.fn(),
}));

vi.mock("./client", () => ({ makeBrowserApiClient: mocks.makeBrowserApiClient }));
vi.mock("./session-source", () => ({ makeToolSessionSource: mocks.makeToolSessionSource }));

import { getConsoleRuntime } from "./runtime";

beforeEach(() => {
  mocks.makeBrowserApiClient.mockReset();
  mocks.makeToolSessionSource.mockReset();
});

describe("getConsoleRuntime", () => {
  it("retries after a transient bootstrap failure", async () => {
    const api = { id: "api" };
    const sessions = { id: "sessions" };
    mocks.makeBrowserApiClient.mockRejectedValueOnce(new Error("temporary failure"));
    mocks.makeBrowserApiClient.mockResolvedValueOnce(api);
    mocks.makeToolSessionSource.mockResolvedValueOnce(sessions);

    await expect(getConsoleRuntime()).rejects.toThrow("temporary failure");
    await expect(getConsoleRuntime()).resolves.toEqual({ api, sessions });
    expect(mocks.makeBrowserApiClient).toHaveBeenCalledTimes(2);
    expect(mocks.makeToolSessionSource).toHaveBeenCalledOnce();
  });
});
