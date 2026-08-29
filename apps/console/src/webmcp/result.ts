export { JsonValue } from "./json-value";
import type { JsonValue } from "./json-value";
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

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = Reflect.get(error, "message");
    if (typeof message === "string") return message;
  }
  return "Clear could not complete this request";
};

const errorCode = (error: unknown) => {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const tag = Reflect.get(error, "_tag");
    if (typeof tag === "string") return tag;
  }
  if (error instanceof Error && error.name !== "Error") return error.name;
  return "REQUEST_FAILED";
};

export const toolFailure = (error: unknown, hint: string) =>
  toJsonValue({
    ok: false,
    error: {
      code: errorCode(error),
      message: errorMessage(error).slice(0, 600),
      retryable: errorCode(error) === "ServiceUnavailable" || errorCode(error) === "REQUEST_FAILED",
    },
    hint,
  });
