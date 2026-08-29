import { randomBytes, webcrypto } from "node:crypto";
import { Crypto, Effect, Layer, PlatformError } from "effect";

export const NodeCryptoLive = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => randomBytes(size),
    digest: (algorithm, data) =>
      Effect.tryPromise({
        try: async () => new Uint8Array(await webcrypto.subtle.digest(algorithm, data)),
        catch: (error) =>
          PlatformError.systemError({
            _tag: "Unknown",
            module: "Crypto",
            method: "digest",
            description: error instanceof Error ? error.message : String(error),
            cause: error,
          }),
      }),
  }),
);
