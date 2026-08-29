import { describe, expect, it } from "vite-plus/test";

import { errorMessage } from "./format";

describe("errorMessage", () => {
  it("does not expose transport internals in product UI", () => {
    expect(errorMessage(new Error("Transport error (POST http://localhost:3000/v1/session)"))).toBe(
      "Clear could not reach the API. Check the connection and try again.",
    );
  });

  it("preserves actionable configuration errors", () => {
    expect(errorMessage(new Error("Set VITE_GROUNDTRUTH_API_URL"))).toBe(
      "Set VITE_GROUNDTRUTH_API_URL",
    );
  });
});
