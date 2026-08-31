import { describe, expect, it } from "vite-plus/test";

import { isPublicRoute } from "./public-routes";

describe("app shell routing", () => {
  it("keeps public surfaces outside the project runtime", () => {
    expect(isPublicRoute("/")).toBe(true);
    expect(isPublicRoute("/status")).toBe(true);
    expect(isPublicRoute("/board")).toBe(false);
  });
});
