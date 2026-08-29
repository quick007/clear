import { SpanId, TraceId } from "@groundtruth/telemetry";
import { Effect } from "effect";
import { InvalidOtlpPayload } from "./InvalidOtlpPayload.js";

export const optionalTraceId = (raw: string | undefined, path: string) =>
  Effect.gen(function* () {
    if (raw === undefined || raw === "") return null;
    const normalized = raw.toLowerCase();
    if (!/^(?!0{32}$)[0-9a-f]{32}$/.test(normalized)) {
      return yield* new InvalidOtlpPayload({
        path,
        message: "traceId must be a non-zero 16-byte hexadecimal value",
      });
    }
    return TraceId.make(normalized);
  });

export const requiredTraceId = (raw: string | undefined, path: string) =>
  Effect.gen(function* () {
    const id = yield* optionalTraceId(raw, path);
    if (id === null) {
      return yield* new InvalidOtlpPayload({ path, message: "traceId is required" });
    }
    return id;
  });

export const optionalSpanId = (raw: string | undefined, path: string) =>
  Effect.gen(function* () {
    if (raw === undefined || raw === "") return null;
    const normalized = raw.toLowerCase();
    if (!/^(?!0{16}$)[0-9a-f]{16}$/.test(normalized)) {
      return yield* new InvalidOtlpPayload({
        path,
        message: "spanId must be a non-zero 8-byte hexadecimal value",
      });
    }
    return SpanId.make(normalized);
  });

export const requiredSpanId = (raw: string | undefined, path: string) =>
  Effect.gen(function* () {
    const id = yield* optionalSpanId(raw, path);
    if (id === null) {
      return yield* new InvalidOtlpPayload({ path, message: "spanId is required" });
    }
    return id;
  });
