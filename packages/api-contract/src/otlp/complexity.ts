import { Schema } from "effect";

export const OtlpStructuralLimits = {
  maxNodes: 50_000,
  maxTotalEntries: 200_000,
  maxContainerEntries: 4_096,
} as const;

export interface OtlpStructuralViolation {
  readonly path: string;
  readonly message: string;
}

type Frame =
  | { readonly _tag: "Visit"; readonly path: string; readonly value: unknown }
  | { readonly _tag: "Leave"; readonly value: object };

const isObjectValue = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const childPath = (path: string, key: string) => (path === "$" ? key : `${path}.${key}`);

export const inspectOtlpStructure = (input: unknown): OtlpStructuralViolation | undefined => {
  const frames: Array<Frame> = [{ _tag: "Visit", path: "$", value: input }];
  const active = new WeakSet<object>();
  let nodes = 0;
  let totalEntries = 0;

  while (frames.length > 0) {
    const frame = frames.pop();
    if (frame === undefined) break;
    if (frame._tag === "Leave") {
      active.delete(frame.value);
      continue;
    }
    if (!Array.isArray(frame.value) && !isObjectValue(frame.value)) continue;
    if (active.has(frame.value)) {
      return { path: frame.path, message: "Payload contains a circular reference" };
    }
    active.add(frame.value);
    frames.push({ _tag: "Leave", value: frame.value });

    nodes += 1;
    if (nodes > OtlpStructuralLimits.maxNodes) {
      return {
        path: frame.path,
        message: `Payload structure exceeds ${OtlpStructuralLimits.maxNodes} container nodes`,
      };
    }

    const keys: Array<string> = [];
    if (!Array.isArray(frame.value)) {
      for (const key in frame.value) {
        if (!Object.hasOwn(frame.value, key)) continue;
        keys.push(key);
        if (keys.length > OtlpStructuralLimits.maxContainerEntries) break;
      }
    }
    const entryCount = Array.isArray(frame.value) ? frame.value.length : keys.length;
    if (entryCount > OtlpStructuralLimits.maxContainerEntries) {
      return {
        path: frame.path,
        message: `Container exceeds ${OtlpStructuralLimits.maxContainerEntries} entries`,
      };
    }

    totalEntries += entryCount;
    if (totalEntries > OtlpStructuralLimits.maxTotalEntries) {
      return {
        path: frame.path,
        message: `Payload structure exceeds ${OtlpStructuralLimits.maxTotalEntries} total entries`,
      };
    }
    if (Array.isArray(frame.value)) {
      for (let index = frame.value.length - 1; index >= 0; index -= 1) {
        frames.push({ _tag: "Visit", path: `${frame.path}[${index}]`, value: frame.value[index] });
      }
      continue;
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key !== undefined) {
        frames.push({
          _tag: "Visit",
          path: childPath(frame.path, key),
          value: frame.value[key],
        });
      }
    }
  }
};

const OtlpStructureBudget = Schema.Unknown.check(
  Schema.makeFilter((input) => {
    const violation = inspectOtlpStructure(input);
    return violation === undefined ? undefined : `${violation.path}: ${violation.message}`;
  }),
);

export const withOtlpStructureBudget = <S extends Schema.Constraint>(schema: S) =>
  OtlpStructureBudget.pipe(Schema.decodeTo(schema));
