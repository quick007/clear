import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ConsoleOutcomeUnknown, ConsoleUnexpected, normalizeConsoleEffect } from "../errors";

const mocks = vi.hoisted(() => ({ getConsoleRuntime: vi.fn() }));

vi.mock("../api/runtime", () => ({ getConsoleRuntime: mocks.getConsoleRuntime }));

import { runGroundtruthMutation, runGroundtruthQuery } from "./runtime-operations";

beforeEach(() => {
  mocks.getConsoleRuntime.mockReset();
  mocks.getConsoleRuntime.mockResolvedValue({
    api: {
      run: <A, E>(effect: Effect.Effect<A, E>, signal?: AbortSignal) =>
        Effect.runPromise(effect.pipe(normalizeConsoleEffect("API request failed")), { signal }),
    },
    sessions: {},
  });
});

describe("runtime operations", () => {
  it("normalizes a synchronous query constructor failure", async () => {
    await expect(
      runGroundtruthQuery(() => {
        throw new Error("invalid schema input");
      }),
    ).rejects.toBeInstanceOf(ConsoleUnexpected);
  });

  it("marks a synchronous mutation constructor failure as outcome unknown", async () => {
    await expect(
      runGroundtruthMutation("Create resource", () => {
        throw new Error("invalid schema input");
      }),
    ).rejects.toBeInstanceOf(ConsoleOutcomeUnknown);
  });
});
