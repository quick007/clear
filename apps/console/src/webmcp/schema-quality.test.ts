import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { makeAlwaysTools } from "./always-tools";
import { makeIncidentTools } from "./incident-tools";
import type { GroundtruthToolOperations } from "./operations";
import { makeSandboxTools } from "./sandbox-tools";
import { QueryMetricsInput, SearchLogsInput, SearchTracesInput } from "./schemas";

const operations = new Proxy(
  {},
  {
    get: () => async () => undefined,
  },
) as GroundtruthToolOperations;

const ToolInputSchema = Schema.Struct({
  type: Schema.Literal("object"),
  properties: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Struct({ description: Schema.String })),
  ),
  additionalProperties: Schema.Literal(false),
});

describe("WebMCP schema quality", () => {
  it("keeps the full tool catalog discoverable and self-describing", () => {
    const tools = [
      ...makeAlwaysTools(operations),
      ...makeIncidentTools(operations, "hosted"),
      ...makeSandboxTools(operations),
    ];
    const definitions = tools.map((prepared) => prepared.definition());

    expect(new Set(definitions.map((definition) => definition.name)).size).toBe(definitions.length);
    for (const definition of definitions) {
      expect(definition.name).toMatch(/^[A-Za-z0-9_.-]{1,30}$/);
      expect(definition.title?.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeLessThanOrEqual(500);

      let input: typeof ToolInputSchema.Type;
      try {
        input = Schema.decodeUnknownSync(ToolInputSchema)(definition.inputSchema);
      } catch (cause) {
        throw new Error(`${definition.name} has an incomplete input schema`, { cause });
      }
      for (const property of Object.values(input.properties ?? {})) {
        expect(property.description.length).toBeGreaterThan(0);
        expect(property.description.length).toBeLessThanOrEqual(150);
      }
    }
  });

  it("rejects contradictory metric inputs at the WebMCP boundary", () => {
    expect(() =>
      Schema.decodeUnknownSync(QueryMetricsInput)({
        metric: "http.server.requests",
        aggregation: "count-distinct",
        window: "5m",
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(QueryMetricsInput)({
        metric: "http.server.requests",
        aggregation: "sum",
        distinctKey: "user.id",
        window: "5m",
      }),
    ).toThrow();
  });

  it("rejects contradictory trace bounds and duplicate service filters", () => {
    expect(() =>
      Schema.decodeUnknownSync(SearchTracesInput)({
        minimumDurationMs: 500,
        maximumDurationMs: 100,
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(SearchTracesInput)({
        services: ["checkout-api", "checkout-api"],
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(SearchLogsInput)({
        services: ["checkout-api", "checkout-api"],
      }),
    ).toThrow();
  });
});
