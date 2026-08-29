import { inspectOtlpStructure, OtlpAnyValueLimits } from "@groundtruth/api-contract";
import { Effect } from "effect";
import { InvalidOtlpPayload } from "./InvalidOtlpPayload.js";

type ObjectValue = Readonly<Record<string, unknown>>;

type Frame =
  | {
      readonly _tag: "Container";
      readonly path: string;
      readonly value: unknown;
    }
  | {
      readonly _tag: "AnyValue";
      readonly depth: number;
      readonly path: string;
      readonly value: ObjectValue;
    };

const isObjectValue = (value: unknown): value is ObjectValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const childPath = (path: string, key: string) => (path.length === 0 ? key : `${path}.${key}`);

const decodedBase64Length = (value: string) => {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
};

const invalid = (path: string, message: string) => new InvalidOtlpPayload({ path, message });

export const validateOtlpAnyValueComplexity = (request: unknown) =>
  Effect.gen(function* () {
    const structuralViolation = inspectOtlpStructure(request);
    if (structuralViolation !== undefined) {
      return yield* invalid(structuralViolation.path, structuralViolation.message);
    }
    const frames: Array<Frame> = [{ _tag: "Container", path: "", value: request }];
    let nodes = 0;

    while (frames.length > 0) {
      const frame = frames.pop();
      if (frame === undefined) break;

      if (frame._tag === "Container") {
        if (Array.isArray(frame.value)) {
          for (let index = frame.value.length - 1; index >= 0; index -= 1) {
            frames.push({
              _tag: "Container",
              path: `${frame.path}[${index}]`,
              value: frame.value[index],
            });
          }
          continue;
        }
        if (!isObjectValue(frame.value)) continue;
        const entries = Object.entries(frame.value);
        for (let index = entries.length - 1; index >= 0; index -= 1) {
          const [key, value] = entries[index] ?? [];
          if (key === undefined) continue;
          const path = childPath(frame.path, key);
          if ((key === "value" || key === "body") && isObjectValue(value)) {
            frames.push({ _tag: "AnyValue", depth: 1, path, value });
          } else {
            frames.push({ _tag: "Container", path, value });
          }
        }
        continue;
      }

      nodes += 1;
      if (nodes > OtlpAnyValueLimits.maxNodes) {
        return yield* invalid(
          frame.path,
          `AnyValue count exceeds ${OtlpAnyValueLimits.maxNodes} nodes`,
        );
      }
      if (frame.depth > OtlpAnyValueLimits.maxDepth) {
        return yield* invalid(
          frame.path,
          `AnyValue nesting exceeds ${OtlpAnyValueLimits.maxDepth} levels`,
        );
      }

      const stringValue = frame.value.stringValue;
      if (
        typeof stringValue === "string" &&
        stringValue.length > OtlpAnyValueLimits.maxStringLength
      ) {
        return yield* invalid(
          `${frame.path}.stringValue`,
          `String value exceeds ${OtlpAnyValueLimits.maxStringLength} characters`,
        );
      }

      const bytesValue = frame.value.bytesValue;
      if (
        typeof bytesValue === "string" &&
        decodedBase64Length(bytesValue) > OtlpAnyValueLimits.maxBytesLength
      ) {
        return yield* invalid(
          `${frame.path}.bytesValue`,
          `Bytes value exceeds ${OtlpAnyValueLimits.maxBytesLength} decoded bytes`,
        );
      }

      const arrayValue = frame.value.arrayValue;
      if (isObjectValue(arrayValue) && Array.isArray(arrayValue.values)) {
        if (arrayValue.values.length > OtlpAnyValueLimits.maxArrayEntries) {
          return yield* invalid(
            `${frame.path}.arrayValue.values`,
            `Array value exceeds ${OtlpAnyValueLimits.maxArrayEntries} entries`,
          );
        }
        for (let index = arrayValue.values.length - 1; index >= 0; index -= 1) {
          const value = arrayValue.values[index];
          if (isObjectValue(value)) {
            frames.push({
              _tag: "AnyValue",
              depth: frame.depth + 1,
              path: `${frame.path}.arrayValue.values[${index}]`,
              value,
            });
          }
        }
      }

      const kvlistValue = frame.value.kvlistValue;
      if (isObjectValue(kvlistValue) && Array.isArray(kvlistValue.values)) {
        if (kvlistValue.values.length > OtlpAnyValueLimits.maxKvlistEntries) {
          return yield* invalid(
            `${frame.path}.kvlistValue.values`,
            `Key-value list exceeds ${OtlpAnyValueLimits.maxKvlistEntries} entries`,
          );
        }
        for (let index = kvlistValue.values.length - 1; index >= 0; index -= 1) {
          const entry = kvlistValue.values[index];
          if (!isObjectValue(entry) || !isObjectValue(entry.value)) continue;
          frames.push({
            _tag: "AnyValue",
            depth: frame.depth + 1,
            path: `${frame.path}.kvlistValue.values[${index}].value`,
            value: entry.value,
          });
        }
      }
    }
  });
