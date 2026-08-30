import { Cause, Duration, Effect, Exit, Schedule, Schema } from "effect";
import { normalizeToolEffect, toolFailureIsRetryable, ToolInputRejected } from "./failures";
import { schemaJson } from "./schemas";
import { toolFailure, toolSuccess, type JsonValue } from "./result";

export interface ToolContract<S extends Schema.ConstraintDecoder<unknown>, O> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: S;
  readonly readOnly: boolean;
  readonly returnsUntrustedContent: boolean;
  readonly invoke: (input: S["Type"], signal: AbortSignal) => Promise<O>;
  readonly format?: (value: O) => unknown;
  readonly afterSuccess?: (value: O, signal: AbortSignal) => PromiseLike<unknown> | void;
  readonly successHint?: string;
  readonly failureHint: string;
  readonly resultOptions?: (value: O) => {
    readonly truncated?: boolean;
    readonly nextCursor?: string | null;
  };
}

export interface PreparedTool {
  readonly name: string;
  readonly definition: (lifecycleSignal?: AbortSignal) => WebMCP.ModelContextTool;
}

const afterSuccessDelay = 0; // 0 milliseconds, the next browser task
const followUpRetryDelay = 250; // 250 milliseconds
const followUpRetryCount = 4;
const followUpRetrySchedule = Schedule.exponential(Duration.millis(followUpRetryDelay)).pipe(
  Schedule.upTo({ times: followUpRetryCount }),
);

const scheduleAfterSuccess = <S extends Schema.ConstraintDecoder<unknown>, O>(
  contract: ToolContract<S, O>,
  value: O,
  lifecycleSignal: AbortSignal | undefined,
) => {
  if (contract.afterSuccess === undefined) return;
  const afterSuccess = contract.afterSuccess;
  setTimeout(() => {
    if (lifecycleSignal?.aborted === true) return;
    const followUp = Effect.tryPromise({
      try: (signal) => Promise.resolve(afterSuccess(value, signal)),
      catch: (cause) => cause,
    }).pipe(
      normalizeToolEffect(`Site tool ${contract.name} could not refresh state`),
      Effect.retry({ schedule: followUpRetrySchedule, while: toolFailureIsRetryable }),
      Effect.catch(() => Effect.succeed(undefined)),
    );

    if (lifecycleSignal === undefined) {
      Effect.runFork(followUp);
      return;
    }

    let interruptFiber: () => void = () => undefined;
    const interrupt = () => interruptFiber();
    lifecycleSignal.addEventListener("abort", interrupt, { once: true });
    const fiber = Effect.runFork(
      followUp.pipe(
        Effect.ensuring(Effect.sync(() => lifecycleSignal.removeEventListener("abort", interrupt))),
      ),
    );
    interruptFiber = () => fiber.interruptUnsafe();
    if (lifecycleSignal.aborted) interrupt();
  }, afterSuccessDelay);
};

const modelContextTool = <S extends Schema.ConstraintDecoder<unknown>, O>(
  contract: ToolContract<S, O>,
  lifecycleSignal: AbortSignal | undefined,
): WebMCP.ModelContextTool => ({
  name: contract.name,
  title: contract.title,
  description: contract.description,
  inputSchema: schemaJson(contract.input),
  annotations: {
    readOnlyHint: contract.readOnly,
    untrustedContentHint: contract.returnsUntrustedContent,
  },
  execute: async (unknownInput, context): Promise<JsonValue> => {
    const signal = context?.signal ?? new AbortController().signal;
    const execution = Schema.decodeUnknownEffect(contract.input)(unknownInput).pipe(
      Effect.mapError(() => new ToolInputRejected()),
      Effect.flatMap((input) =>
        Effect.tryPromise({
          try: () => contract.invoke(input, signal),
          catch: (cause) => cause,
        }),
      ),
      Effect.map((value) => {
        const data = contract.format === undefined ? value : contract.format(value);
        const result = toolSuccess(data, {
          hint: contract.successHint,
          ...contract.resultOptions?.(value),
        });
        scheduleAfterSuccess(contract, value, lifecycleSignal);
        return result;
      }),
      normalizeToolEffect(`Site tool ${contract.name} failed`),
      Effect.catch((failure) =>
        Effect.succeed(toolFailure(failure, contract.failureHint, { readOnly: contract.readOnly })),
      ),
    );
    const exit = await Effect.runPromiseExit(execution, { signal });
    if (Exit.isSuccess(exit)) return exit.value;
    if (signal.aborted) throw signal.reason;
    throw Cause.squash(exit.cause);
  },
});

export const tool = <S extends Schema.ConstraintDecoder<unknown>, O>(
  contract: ToolContract<S, O>,
): PreparedTool => ({
  name: contract.name,
  definition: (lifecycleSignal) => modelContextTool(contract, lifecycleSignal),
});
