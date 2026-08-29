import { Schema } from "effect";
import { JsonValue, type JsonValue as JsonValueType } from "./json-value";

export const toolResultLimits = {
  maxBytes: 48 * 1024,
  maxDepth: 8,
  maxStringLength: 2_048,
} as const;

interface CompactionProfile {
  readonly maxArrayItems: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxObjectEntries: number;
  readonly maxStringLength: number;
}

interface EncodedResult {
  readonly encoded: string;
  readonly truncated: boolean;
}

export interface BoundedJsonResult {
  readonly value: JsonValueType;
  readonly truncated: boolean;
}

const profiles = [
  {
    maxArrayItems: 150,
    maxDepth: toolResultLimits.maxDepth,
    maxNodes: 8_000,
    maxObjectEntries: 80,
    maxStringLength: toolResultLimits.maxStringLength,
  },
  {
    maxArrayItems: 80,
    maxDepth: 7,
    maxNodes: 4_000,
    maxObjectEntries: 56,
    maxStringLength: 1_024,
  },
  {
    maxArrayItems: 48,
    maxDepth: 7,
    maxNodes: 2_400,
    maxObjectEntries: 40,
    maxStringLength: 512,
  },
  {
    maxArrayItems: 24,
    maxDepth: 6,
    maxNodes: 1_200,
    maxObjectEntries: 28,
    maxStringLength: 320,
  },
  {
    maxArrayItems: 12,
    maxDepth: 5,
    maxNodes: 480,
    maxObjectEntries: 16,
    maxStringLength: 192,
  },
] as const satisfies readonly [CompactionProfile, ...ReadonlyArray<CompactionProfile>];

const truncatedValue = "[truncated]";
const circularValue = "[truncated: circular reference]";
const depthValue = "[truncated: depth limit]";
const sizeValue = "Result exceeded the WebMCP output limit. Refine the query for more detail.";
const textEncoder = new TextEncoder();

const byteLength = (value: string) => textEncoder.encode(value).byteLength;

const truncateString = (value: string, limit: number) => {
  if (value.length <= limit) return value;
  const suffix = ` ${truncatedValue}`;
  const end = Math.max(0, limit - suffix.length);
  let prefix = value.slice(0, end);
  const lastCodeUnit = prefix.charCodeAt(prefix.length - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) prefix = prefix.slice(0, -1);
  return `${prefix}${suffix}`;
};

const encodeBytes = (value: Uint8Array, limit: number) => {
  const encodedLength = 4 * Math.ceil(value.byteLength / 3);
  const suffix = encodedLength > limit ? ` ${truncatedValue}` : "";
  const byteLimit = Math.max(0, Math.floor((limit - suffix.length) * 0.75));
  const bytes = value.subarray(0, byteLimit);
  return `${btoa(String.fromCharCode(...bytes))}${suffix}`;
};

const encodeWithProfile = (value: unknown, profile: CompactionProfile): EncodedResult => {
  const depths = new WeakMap<object, number>();
  const seen = new WeakSet<object>();
  let nodes = 0;
  let truncated = false;

  const replacer = function (this: object, _key: string, current: unknown): unknown {
    nodes += 1;
    if (nodes > profile.maxNodes) {
      truncated = true;
      return truncatedValue;
    }

    if (typeof current === "string") {
      const next = truncateString(current, profile.maxStringLength);
      if (next !== current) truncated = true;
      return next;
    }
    if (typeof current === "bigint") return current.toString();
    if (current instanceof Uint8Array) {
      if (4 * Math.ceil(current.byteLength / 3) > profile.maxStringLength) truncated = true;
      return encodeBytes(current, profile.maxStringLength);
    }
    if (typeof current !== "object" || current === null) return current;

    const depth = (depths.get(this) ?? -1) + 1;
    if (depth >= profile.maxDepth) {
      truncated = true;
      return depthValue;
    }
    if (seen.has(current)) {
      truncated = true;
      return circularValue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      const compact = current.slice(0, profile.maxArrayItems);
      if (compact.length < current.length) truncated = true;
      depths.set(compact, depth);
      return compact;
    }

    const sourceEntries = Object.entries(current);
    const compactEntries: Array<readonly [string, unknown]> = [];
    const keys = new Set<string>();
    for (const [key, entryValue] of sourceEntries.slice(0, profile.maxObjectEntries)) {
      const compactKey = truncateString(key, profile.maxStringLength);
      if (compactKey !== key || keys.has(compactKey)) truncated = true;
      if (keys.has(compactKey)) continue;
      keys.add(compactKey);
      compactEntries.push([compactKey, entryValue]);
    }
    if (compactEntries.length < sourceEntries.length) truncated = true;
    const compact = Object.fromEntries(compactEntries);
    depths.set(compact, depth);
    return compact;
  };

  const encoded = JSON.stringify(value, replacer);
  return { encoded: encoded ?? "null", truncated };
};

const decode = (encoded: string) => Schema.decodeUnknownSync(JsonValue)(JSON.parse(encoded));

const fallback = (value: JsonValueType): JsonValueType => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { truncated: true, summary: sizeValue };
  }
  const record = value as { readonly [key: string]: JsonValueType };
  const ok = typeof record.ok === "boolean" ? record.ok : undefined;
  const hint = typeof record.hint === "string" ? truncateString(record.hint, 320) : undefined;
  return {
    ...(ok === undefined ? {} : { ok }),
    ...(hint === undefined ? {} : { hint }),
    truncated: true,
    data: { summary: sizeValue },
  };
};

export const toBoundedJsonValue = (value: unknown): BoundedJsonResult => {
  const initial = encodeWithProfile(value, profiles[0]);
  if (byteLength(initial.encoded) <= toolResultLimits.maxBytes) {
    return { value: decode(initial.encoded), truncated: initial.truncated };
  }

  const normalized = decode(initial.encoded);
  for (const profile of profiles.slice(1)) {
    const compact = encodeWithProfile(normalized, profile);
    if (byteLength(compact.encoded) <= toolResultLimits.maxBytes) {
      return { value: decode(compact.encoded), truncated: true };
    }
  }

  return { value: fallback(normalized), truncated: true };
};
