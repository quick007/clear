import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { remainingRetrySeconds, runRetryCountdown } from "./retry-countdown";

describe("retry countdown", () => {
  it("uses the deadline instead of assuming every timer tick ran", () => {
    expect(remainingRetrySeconds(12_000, 4_001)).toBe(8);
    expect(remainingRetrySeconds(12_000, 12_000)).toBe(0);
    expect(remainingRetrySeconds(12_000, 14_000)).toBe(0);
  });

  it("ticks down and completes with the Effect clock", async () => {
    const ticks: Array<number> = [];
    const program = Effect.gen(function* () {
      const fiber = yield* runRetryCountdown(3, (remaining) => ticks.push(remaining)).pipe(
        Effect.forkChild,
      );

      yield* Effect.yieldNow;
      expect(ticks).toEqual([3]);
      yield* TestClock.adjust("1 second");
      expect(ticks).toEqual([3, 2]);
      yield* TestClock.adjust("2 seconds");
      yield* Fiber.join(fiber);
      expect(ticks).toEqual([3, 2, 1, 0]);
    });

    await Effect.runPromise(Effect.provide(program, TestClock.layer()));
  });
});
