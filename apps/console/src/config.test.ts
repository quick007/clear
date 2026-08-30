import { describe, expect, it } from "vite-plus/test";
import { readConsoleConfig } from "./config";

describe("console configuration", () => {
  it("reads and normalizes explicit browser origins", () => {
    expect(
      readConsoleConfig({
        VITE_CLEAR_OTLP_ENDPOINT: "https://otlp.clear.test/",
        VITE_GROUNDTRUTH_API_URL: "https://api.clear.test/",
      }),
    ).toEqual({
      apiOrigin: "https://api.clear.test",
      otlpOrigin: "https://otlp.clear.test",
    });
  });

  it("rejects missing origins", () => {
    expect(() => readConsoleConfig({})).toThrow("VITE_CLEAR_OTLP_ENDPOINT");
  });

  it("rejects origins with paths", () => {
    expect(() =>
      readConsoleConfig({
        VITE_CLEAR_OTLP_ENDPOINT: "https://otlp.clear.test/v1",
        VITE_GROUNDTRUTH_API_URL: "https://api.clear.test",
      }),
    ).toThrow("VITE_CLEAR_OTLP_ENDPOINT");
  });

  it.each(["ftp://otlp.clear.test", "https://user:secret@otlp.clear.test"])(
    "rejects a non-HTTP or credential-bearing origin: %s",
    (otlpOrigin) => {
      expect(() =>
        readConsoleConfig({
          VITE_CLEAR_OTLP_ENDPOINT: otlpOrigin,
          VITE_GROUNDTRUTH_API_URL: "https://api.clear.test",
        }),
      ).toThrow("VITE_CLEAR_OTLP_ENDPOINT");
    },
  );
});
