import { ServiceUnavailable } from "@groundtruth/api-contract";
import { QuotaExceeded } from "@groundtruth/domain";
import { Clock, Crypto, Effect, Encoding, Ref } from "effect";
import { BackendConfig } from "../config/BackendConfig.js";

const rateLimitWindowMillis = 60 * 1_000; // 1 minute
const maximumActiveIdentities = 10_000;
const textEncoder = new TextEncoder();

interface RateLimitBucket {
  readonly windowStartedAt: number;
  readonly count: number;
}

export interface AuthenticatedRequestLimiter {
  readonly consume: (sessionId: string) => Effect.Effect<void, QuotaExceeded | ServiceUnavailable>;
}

type RateLimitOutcome =
  | { readonly _tag: "allowed" }
  | { readonly _tag: "request-quota"; readonly observed: number }
  | { readonly _tag: "identity-capacity"; readonly observed: number };

const quotaExceeded = (limit: number, observed: number) =>
  new QuotaExceeded({
    quota: "authenticated requests per minute",
    limit,
    observed,
    message: "Authenticated request rate limit exceeded. Try again in one minute.",
  });

const identityCapacityExceeded = (observed: number) =>
  new QuotaExceeded({
    quota: "active authenticated rate-limit identities",
    limit: maximumActiveIdentities,
    observed,
    message: "Authenticated request capacity is temporarily full. Try again in one minute.",
  });

const unavailable = () =>
  new ServiceUnavailable({
    service: "request-limiter",
    message: "Authenticated request limiter is unavailable",
  });

export const makeAuthenticatedRequestLimiter = Effect.fn("AuthenticatedRequestLimiter.make")(
  function* () {
    const config = yield* BackendConfig;
    const crypto = yield* Crypto.Crypto;
    const buckets = yield* Ref.make<ReadonlyMap<string, RateLimitBucket>>(new Map());

    const consume = Effect.fn("AuthenticatedRequestLimiter.consume")(function* (sessionId: string) {
      const identity = yield* crypto
        .digest("SHA-256", textEncoder.encode(sessionId))
        .pipe(Effect.map(Encoding.encodeHex), Effect.mapError(unavailable));
      const now = yield* Clock.currentTimeMillis;
      const outcome = yield* Ref.modify(
        buckets,
        (current): readonly [RateLimitOutcome, ReadonlyMap<string, RateLimitBucket>] => {
          const activeBuckets = new Map(
            Array.from(current).filter(
              ([, bucket]) => now - bucket.windowStartedAt < rateLimitWindowMillis,
            ),
          );
          const previous = activeBuckets.get(identity);
          if (previous === undefined && activeBuckets.size >= maximumActiveIdentities) {
            return [{ _tag: "identity-capacity", observed: activeBuckets.size + 1 }, activeBuckets];
          }

          const active = previous ?? { windowStartedAt: now, count: 0 };
          const observed = active.count + 1;
          activeBuckets.set(identity, { ...active, count: observed });
          return [
            active.count < config.authenticatedRequestsPerMinute
              ? { _tag: "allowed" }
              : { _tag: "request-quota", observed },
            activeBuckets,
          ];
        },
      );

      if (outcome._tag === "request-quota") {
        return yield* quotaExceeded(config.authenticatedRequestsPerMinute, outcome.observed);
      }
      if (outcome._tag === "identity-capacity") {
        return yield* identityCapacityExceeded(outcome.observed);
      }
    });

    return { consume } satisfies AuthenticatedRequestLimiter;
  },
);
