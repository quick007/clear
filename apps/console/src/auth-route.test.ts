import { describe, expect, it } from "vite-plus/test";

import { isSafeReturnPath, signInHref, signInPath } from "./auth-route";

describe("Clear sign-in route", () => {
  it("builds the public sign-in URL with an encoded local return path", () => {
    expect(signInPath).toBe("/sign-in");
    expect(signInHref("/incidents/incident-1?tab=timeline")).toBe(
      "/sign-in?returnPath=%2Fincidents%2Fincident-1%3Ftab%3Dtimeline",
    );
  });

  it.each(["https://attacker.test", "//attacker.test", "/safe\\escape", "/a\nb"])(
    "falls back to the board for the unsafe return path %s",
    (returnPath) => {
      expect(isSafeReturnPath(returnPath)).toBe(false);
      expect(signInHref(returnPath)).toBe("/sign-in?returnPath=%2Fboard");
    },
  );
});
