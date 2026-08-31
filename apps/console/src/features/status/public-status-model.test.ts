import { PublicStatusMetric } from "@groundtruth/api-contract";
import { DateTime } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  formatPublicMetricValue,
  latestMetricValue,
  publicMetricSeries,
  publicStatusPresentation,
} from "./public-status-model";

const point = (seconds: number, value: number) => ({
  at: DateTime.fromDateUnsafe(
    new Date(`2026-08-30T06:00:${String(seconds).padStart(2, "0")}.000Z`),
  ),
  value,
});

describe("public status presentation", () => {
  it("uses restrained semantic status copy", () => {
    expect(publicStatusPresentation.operational).toMatchObject({
      headline: "All systems operational",
      tone: "healthy",
    });
    expect(publicStatusPresentation.unavailable.tone).toBe("critical");
  });

  it("materializes bounded status chart series", () => {
    const metric = PublicStatusMetric.make({
      key: "request-rate",
      title: "Request rate",
      description: "Requests handled by Clear services.",
      unit: "requests/s",
      status: "ready",
      series: [
        { label: "Clear API", points: [point(0, 12), point(10, 15)] },
        { label: "Checkout API", points: [point(0, 22), point(10, 25)] },
      ],
    });

    expect(publicMetricSeries(metric)).toMatchObject([
      { bucketDurationMs: 10_000, label: "Clear API", queryRef: "A" },
      { bucketDurationMs: 10_000, label: "Checkout API", queryRef: "B" },
    ]);
    expect(latestMetricValue(metric)).toBe(40);
    expect(formatPublicMetricValue(metric, 40.25)).toBe("40.3 req/s");
  });
});
