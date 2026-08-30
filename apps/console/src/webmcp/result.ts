export { JsonValue } from "./json-value";
import type { JsonValue } from "./json-value";
import {
  presentToolExecutionFailure,
  toolFailureHasUnknownWriteOutcome,
  type ToolExecutionFailure,
  type ToolFailureContext,
} from "./failures";
import { toBoundedJsonValue } from "./result-bounds";

export const toJsonValue = (value: unknown): JsonValue => toBoundedJsonValue(value).value;

export const toolSuccess = (
  data: unknown,
  options: {
    readonly hint?: string;
    readonly truncated?: boolean;
    readonly nextCursor?: string | null;
  } = {},
) => {
  const envelope = {
    ok: true,
    ...(options.hint === undefined ? {} : { hint: options.hint }),
    ...(options.truncated === undefined ? {} : { truncated: options.truncated }),
    ...(options.nextCursor === undefined || options.nextCursor === null
      ? {}
      : { nextCursor: options.nextCursor }),
    data,
  };
  const bounded = toBoundedJsonValue(envelope);
  if (!bounded.truncated) return bounded.value;
  return toBoundedJsonValue({
    ...(bounded.value as { readonly [key: string]: JsonValue }),
    truncated: true,
  }).value;
};

export const toolFailure = (
  failure: ToolExecutionFailure,
  hint: string,
  context: ToolFailureContext,
) => {
  const presentation = presentToolExecutionFailure(failure, context);
  const recoveryHint = toolFailureHasUnknownWriteOutcome(failure, context)
    ? `The change may already be present. Read the current state before deciding whether to retry. ${hint}`
    : hint;
  return toJsonValue({
    ok: false,
    error: presentation,
    hint: recoveryHint,
  });
};
