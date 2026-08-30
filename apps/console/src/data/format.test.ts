import { describe, expect, it } from "vite-plus/test";

import { ConsoleUnavailable } from "../errors";
import { errorMessage } from "./format";

describe("errorMessage", () => {
  it("does not expose transport internals in product UI", () => {
    expect(errorMessage(new ConsoleUnavailable({ retryable: true }))).toBe(
      "Clear could not reach the API. Check your connection and try again.",
    );
  });

  it("does not expose unexpected diagnostics", () => {
    expect(errorMessage(new Error("Set VITE_GROUNDTRUTH_API_URL"))).toBe(
      "Clear could not complete this request. Refresh the page and try again.",
    );
  });
});
