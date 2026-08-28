import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { retryImmediately } from "./retry.js";

describe("retryImmediately", () => {
  it.effect("runs one initial attempt and three immediate retries", () =>
    Effect.gen(function* () {
      const attempts: Array<number> = [];
      const error = yield* retryImmediately((attempt) => {
        attempts.push(attempt);
        return Effect.fail("upstream unavailable" as const);
      }).pipe(Effect.flip);

      expect(error).toBe("upstream unavailable");
      expect(attempts).toEqual([0, 1, 2, 3]);
    }),
  );

  it.effect("returns the first successful retry", () =>
    Effect.gen(function* () {
      const attempts: Array<number> = [];
      const result = yield* retryImmediately((attempt) => {
        attempts.push(attempt);
        return attempt === 2
          ? Effect.succeed("approved" as const)
          : Effect.fail("declined" as const);
      });

      expect(result).toBe("approved");
      expect(attempts).toEqual([0, 1, 2]);
    }),
  );
});
