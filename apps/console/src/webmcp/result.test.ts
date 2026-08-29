import { describe, expect, it } from "vite-plus/test";
import { toolResultLimits } from "./result-bounds";
import { toJsonValue, toolSuccess, type JsonValue } from "./result";

const encodedBytes = (value: JsonValue) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

const stringsIn = (value: JsonValue): ReadonlyArray<string> => {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  return Object.entries(value).flatMap(([key, entry]) => [key, ...stringsIn(entry)]);
};

describe("WebMCP result bounds", () => {
  it("keeps useful envelope fields while enforcing the total byte limit", () => {
    const result = toolSuccess(
      {
        summary: "Requests rose while unique users stayed flat",
        records: Array.from({ length: 200 }, (_, index) => ({
          index,
          body: `record-${index}:${"🚨".repeat(3_000)}`,
          attributes: Object.fromEntries(
            Array.from({ length: 100 }, (_entry, attribute) => [
              `attribute-${attribute}`,
              "x".repeat(3_000),
            ]),
          ),
        })),
      },
      {
        hint: "Group requests by retry to test the amplification hypothesis.",
        nextCursor: "next-page",
      },
    );

    expect(encodedBytes(result)).toBeLessThanOrEqual(toolResultLimits.maxBytes);
    expect(result).toMatchObject({
      ok: true,
      hint: "Group requests by retry to test the amplification hypothesis.",
      nextCursor: "next-page",
      truncated: true,
      data: { summary: "Requests rose while unique users stayed flat" },
    });
    expect(Math.max(...stringsIn(result).map((value) => value.length))).toBeLessThanOrEqual(
      toolResultLimits.maxStringLength,
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("bounds depth, collection size, long keys, and circular references", () => {
    const circular: Record<string, unknown> = { label: "root" };
    circular.self = circular;
    let deep: Record<string, unknown> = { leaf: "still useful" };
    for (let index = 0; index < 30; index += 1) deep = { child: deep };

    const result = toolSuccess({
      circular,
      deep,
      values: Array.from({ length: 500 }, (_, index) => index),
      ["key".repeat(1_000)]: "value",
    });
    const encoded = JSON.stringify(result);

    expect(encodedBytes(result)).toBeLessThanOrEqual(toolResultLimits.maxBytes);
    expect(result).toMatchObject({ ok: true, truncated: true });
    expect(encoded).toContain("[truncated: circular reference]");
    expect(encoded).toContain("[truncated: depth limit]");
    expect(
      stringsIn(result).every((value) => value.length <= toolResultLimits.maxStringLength),
    ).toBe(true);
  });

  it("normalizes special values without producing invalid JSON", () => {
    const result = toJsonValue({
      count: 9_007_199_254_740_993n,
      notFinite: Number.POSITIVE_INFINITY,
      bytes: new Uint8Array([71, 84]),
      missing: undefined,
    });

    expect(result).toEqual({
      count: "9007199254740993",
      notFinite: null,
      bytes: "R1Q=",
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
