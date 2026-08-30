import { TelemetryInteger } from "@groundtruth/telemetry";
import { describe, expect, it } from "vite-plus/test";

import { retryAttemptCount } from "./trace-insights";

describe("retryAttemptCount", () => {
  it("counts retry depth from canonical attempt attributes without double-counting spans", () => {
    const attempts = [1n, 1n, 2n, 2n, 3n, 3n].map((value) => ({
      attributes: { attempt: new TelemetryInteger({ value }) },
    }));

    expect(retryAttemptCount(attempts)).toBe(2);
  });

  it("uses the explicit retry count when the parent span records it", () => {
    expect(
      retryAttemptCount([
        { attributes: { "retry.count": new TelemetryInteger({ value: 3n }) } },
        { attributes: { attempt: new TelemetryInteger({ value: 2n }) } },
      ]),
    ).toBe(3);
  });

  it("ignores malformed and unsafe attribute values", () => {
    expect(
      retryAttemptCount([
        { attributes: { attempt: "unknown" } },
        { attributes: { attempt: 2.5 } },
        {
          attributes: {
            "retry.count": new TelemetryInteger({ value: 9_007_199_254_740_993n }),
          },
        },
      ]),
    ).toBe(0);
  });
});
