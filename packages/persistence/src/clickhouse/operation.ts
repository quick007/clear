import { Effect } from "effect";
import { clickhouseCauseIsRetryable, persistenceError } from "../errors.ts";

export const clickhouseAttempt = <A>(operation: string, run: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      persistenceError("clickhouse", operation, cause, clickhouseCauseIsRetryable(cause)),
  });
