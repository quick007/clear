import { Clock, Effect } from "effect";

const countdownTick = 1_000; // 1 second

export const remainingRetrySeconds = (retryAt: number, now: number) =>
  Math.max(0, Math.ceil((retryAt - now) / countdownTick));

export const runRetryCountdown = (seconds: number, onTick: (remainingSeconds: number) => void) =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis;
    const retryAt = startedAt + seconds * countdownTick;
    let remaining = seconds;

    yield* Effect.sync(() => onTick(remaining));

    while (remaining > 0) {
      yield* Effect.sleep(countdownTick);
      const now = yield* Clock.currentTimeMillis;
      remaining = remainingRetrySeconds(retryAt, now);
      yield* Effect.sync(() => onTick(remaining));
    }
  });
