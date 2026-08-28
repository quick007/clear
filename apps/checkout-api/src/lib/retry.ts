import { Effect } from "effect";

/**
 * Intentionally broken for the incident exercise.
 *
 * Every failure is retried immediately. There is no backoff, jitter, shared
 * budget, or circuit breaker, so a struggling dependency receives even more
 * traffic precisely when it has the least spare capacity.
 */
export const retryImmediately = <A, E, R>(
  operation: (attempt: number) => Effect.Effect<A, E, R>,
  maxRetries = 3,
): Effect.Effect<A, E, R> => {
  const run = (attempt: number): Effect.Effect<A, E, R> =>
    operation(attempt).pipe(
      Effect.catch((error) => (attempt >= maxRetries ? Effect.fail(error) : run(attempt + 1))),
    );

  return run(0);
};
