import { describe, expect, it } from "vite-plus/test";
import { readCheckoutConfig } from "./config";

describe("checkout configuration", () => {
  it("reads and normalizes an explicit API origin", () => {
    expect(
      readCheckoutConfig({ VITE_CHECKOUT_API_URL: "https://checkout-api.clear.test/" }),
    ).toEqual({ apiOrigin: "https://checkout-api.clear.test" });
  });

  it("rejects a missing API origin", () => {
    expect(() => readCheckoutConfig({})).toThrow("VITE_CHECKOUT_API_URL");
  });

  it("rejects an API origin with a path", () => {
    expect(() =>
      readCheckoutConfig({ VITE_CHECKOUT_API_URL: "https://checkout-api.clear.test/v1" }),
    ).toThrow("VITE_CHECKOUT_API_URL");
  });

  it.each(["ftp://checkout-api.clear.test", "https://user:secret@checkout-api.clear.test"])(
    "rejects a non-HTTP or credential-bearing API origin: %s",
    (apiOrigin) => {
      expect(() => readCheckoutConfig({ VITE_CHECKOUT_API_URL: apiOrigin })).toThrow(
        "VITE_CHECKOUT_API_URL",
      );
    },
  );
});
