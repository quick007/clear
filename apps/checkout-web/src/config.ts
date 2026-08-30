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

const CheckoutEnvironment = Schema.Struct({
  VITE_CHECKOUT_API_URL: HttpOrigin,
});

const decodeEnvironment = (environment: unknown) => {
  try {
    return Schema.decodeUnknownSync(CheckoutEnvironment)(environment, { errors: "all" });
  } catch (error) {
    if (Schema.isSchemaError(error)) {
      throw new Error(`Invalid checkout environment:\n${error.message}`, { cause: error });
    }
    throw error;
  }
};

export const readCheckoutConfig = (environment: unknown) => {
  const decoded = decodeEnvironment(environment);
  return {
    apiOrigin: decoded.VITE_CHECKOUT_API_URL.origin,
  };
};

let browserConfig: ReturnType<typeof readCheckoutConfig> | undefined;

export const getCheckoutConfig = () => {
  browserConfig ??= readCheckoutConfig(import.meta.env);
  return browserConfig;
};
