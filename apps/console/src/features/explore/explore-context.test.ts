import { ConsoleUnavailable } from "../../errors";
import { describe, expect, it } from "vite-plus/test";

import { overviewContextFailure } from "./explore-context";

describe("overviewContextFailure", () => {
  it("keeps an unavailable overview visible even before it has cached service context", () => {
    const failure = new ConsoleUnavailable({ retryable: true });

    expect(overviewContextFailure({ data: undefined, error: failure })).toBe(failure);
  });

  it("keeps a failed refresh visible while callers continue using cached context", () => {
    const failure = new ConsoleUnavailable({ retryable: true });

    expect(overviewContextFailure({ data: { services: [] }, error: failure })).toBe(failure);
  });
});
