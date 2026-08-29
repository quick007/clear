import { OtelFlags, UnixNano } from "@groundtruth/telemetry";
import { Effect } from "effect";
import { InvalidOtlpPayload } from "./InvalidOtlpPayload.js";

const signedMinimum = -9_223_372_036_854_775_808n;
const signedMaximum = 9_223_372_036_854_775_807n;
const unsignedMaximum = 18_446_744_073_709_551_615n;
const flagsMaximum = 4_294_967_295;

const invalid = (path: string, message: string) => new InvalidOtlpPayload({ path, message });

const exactBigInt = (value: string | number, path: string) =>
  Effect.gen(function* () {
    if (typeof value === "number" && !Number.isSafeInteger(value)) {
      return yield* invalid(
        path,
        "64-bit integer values outside the safe JavaScript range must use decimal strings",
      );
    }
    return yield* Effect.try({
      try: () => BigInt(value),
      catch: () => invalid(path, "Value must use decimal integer syntax"),
    });
  });

export const signedInt64 = (value: string | number | undefined, path: string) =>
  Effect.gen(function* () {
    const parsed = yield* exactBigInt(value ?? 0, path);
    if (parsed < signedMinimum || parsed > signedMaximum) {
      return yield* invalid(path, "Value must be a signed 64-bit integer");
    }
    return parsed;
  });

export const unsignedInt64 = (value: string | number | undefined, path: string) =>
  Effect.gen(function* () {
    const parsed = yield* exactBigInt(value ?? 0, path);
    if (parsed < 0n || parsed > unsignedMaximum) {
      return yield* invalid(path, "Value must be an unsigned 64-bit integer");
    }
    return parsed;
  });

export const optionalUnsignedInt64 = (value: string | number | undefined, path: string) =>
  value === undefined ? Effect.succeed(null) : unsignedInt64(value, path);

export const unixNano = (value: string | number | undefined, path: string) =>
  unsignedInt64(value, path).pipe(Effect.map((parsed) => UnixNano.make(parsed)));

export const optionalUnixNano = (value: string | number | undefined, path: string) =>
  value === undefined ? Effect.succeed(null) : unixNano(value, path);

export const otelFlags = (value: number | undefined, path: string) =>
  Effect.gen(function* () {
    const parsed = value ?? 0;
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > flagsMaximum) {
      return yield* invalid(path, "Flags must be an unsigned 32-bit integer");
    }
    return OtelFlags.make(parsed);
  });
