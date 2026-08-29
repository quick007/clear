import { Schema } from "effect";
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
  readonly afterSuccess?: (value: O) => PromiseLike<unknown> | void;
  readonly successHint?: string;
  readonly failureHint: string;
  readonly resultOptions?: (value: O) => {
    readonly truncated?: boolean;
    readonly nextCursor?: string | null;
  };
}

export interface PreparedTool {
  readonly name: string;
  readonly definition: () => WebMCP.ModelContextTool;
}

const afterSuccessDelay = 0; // 0 milliseconds, the next browser task

const modelContextTool = <S extends Schema.ConstraintDecoder<unknown>, O>(
  contract: ToolContract<S, O>,
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
    try {
      const input = await Schema.decodeUnknownPromise(contract.input)(unknownInput);
      const value = await contract.invoke(input, signal);
      const data = contract.format === undefined ? value : contract.format(value);
      const result = toolSuccess(data, {
        hint: contract.successHint,
        ...contract.resultOptions?.(value),
      });
      if (contract.afterSuccess !== undefined) {
        const afterSuccess = contract.afterSuccess;
        setTimeout(() => {
          void Promise.resolve()
            .then(() => afterSuccess(value))
            .catch((error: unknown) => {
              console.warn(`Clear site tool ${contract.name} could not refresh state`, error);
            });
        }, afterSuccessDelay);
      }
      return result;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      return toolFailure(error, contract.failureHint);
    }
  },
});

export const tool = <S extends Schema.ConstraintDecoder<unknown>, O>(
  contract: ToolContract<S, O>,
): PreparedTool => ({
  name: contract.name,
  definition: () => modelContextTool(contract),
});
