import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { CheckoutRequest } from "./contracts.js";

const validRequest = {
  amountCents: 16_058,
  itemCount: 1,
  requestId: "req_123",
  userId: "user-0001",
};

describe("CheckoutRequest", () => {
  it.effect("accepts the storefront request shape", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(CheckoutRequest)(validRequest);
      expect(decoded).toEqual(validRequest);
    }),
  );

  it.effect("rejects oversized and unsafe identifiers", () =>
    Effect.gen(function* () {
      const decode = Schema.decodeUnknownEffect(CheckoutRequest);
      expect(
        yield* Effect.exit(decode({ ...validRequest, userId: "u".repeat(129) })),
      ).toHaveProperty("_tag", "Failure");
      expect(yield* Effect.exit(decode({ ...validRequest, requestId: "bad id" }))).toHaveProperty(
        "_tag",
        "Failure",
      );
    }),
  );

  it.effect("rejects unreasonable order quantities", () =>
    Effect.gen(function* () {
      const decode = Schema.decodeUnknownEffect(CheckoutRequest);
      expect(
        yield* Effect.exit(decode({ ...validRequest, amountCents: 10_000_001 })),
      ).toHaveProperty("_tag", "Failure");
      expect(yield* Effect.exit(decode({ ...validRequest, itemCount: 101 }))).toHaveProperty(
        "_tag",
        "Failure",
      );
    }),
  );
});
