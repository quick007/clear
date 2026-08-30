import { Schema } from "effect";

const HttpOrigin = Schema.URLFromString.check(
  Schema.makeFilter<URL>((url) => {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "origin protocol must be HTTP or HTTPS";
    }
    if (url.username !== "" || url.password !== "") {
      return "origin must not contain credentials";
    }
    if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
      return "origin must not contain a path, query, or fragment";
    }
  }),
);

const ConsoleEnvironment = Schema.Struct({
  VITE_CLEAR_OTLP_ENDPOINT: HttpOrigin,
  VITE_GROUNDTRUTH_API_URL: HttpOrigin,
});

const decodeEnvironment = (environment: unknown) => {
  try {
    return Schema.decodeUnknownSync(ConsoleEnvironment)(environment, { errors: "all" });
  } catch (error) {
    if (Schema.isSchemaError(error)) {
      throw new Error(`Invalid console environment:\n${error.message}`, { cause: error });
    }
    throw error;
  }
};

export const readConsoleConfig = (environment: unknown) => {
  const decoded = decodeEnvironment(environment);
  return {
    apiOrigin: decoded.VITE_GROUNDTRUTH_API_URL.origin,
    otlpOrigin: decoded.VITE_CLEAR_OTLP_ENDPOINT.origin,
  };
};

let browserConfig: ReturnType<typeof readConsoleConfig> | undefined;

export const getConsoleConfig = () => {
  browserConfig ??= readConsoleConfig(import.meta.env);
  return browserConfig;
};
