import { BootstrapIngestKeyMinimumLength, bootstrapIngestKeyIsValid } from "../src/bootstrap.ts";
import { describe, expect, it } from "vite-plus/test";

describe("bootstrap validation", () => {
  it("matches the Collector ingest-key minimum", () => {
    expect(BootstrapIngestKeyMinimumLength).toBe(16);
    expect(bootstrapIngestKeyIsValid("x".repeat(15))).toBe(false);
    expect(bootstrapIngestKeyIsValid("x".repeat(16))).toBe(true);
  });
});
