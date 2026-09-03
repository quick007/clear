import { PublicStatusResponse } from "@groundtruth/api-contract";
import { Schema } from "effect";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { StatusPage, statusChartSlotHeight, statusMetricEmptyHeight } from "./status-page";

const testState = vi.hoisted(() => ({ data: null as unknown }));

vi.mock("@stylexjs/stylex", () => ({
  create: (rules: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.keys(rules).map((name) => [name, name])),
  defineVars: (variables: Readonly<Record<string, string>>) => variables,
  props: (...names: ReadonlyArray<string | false>) => ({
    "data-style": names.filter(Boolean).join(" "),
  }),
}));

vi.mock("@tanstack/react-router", async () => {
  const { createElement } = await import("react");
  return {
    Link: ({ children, to }: { children?: React.ReactNode; to: string }) =>
      createElement("a", { href: to }, children),
  };
});

vi.mock("../../data/public-status", () => ({
  usePublicStatusQuery: () => ({
    data: testState.data,
    error: null,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../../ui/button", async () => {
  const { cloneElement, createElement, isValidElement } = await import("react");
  return {
    Button: ({ children, render }: { children: React.ReactNode; render?: React.ReactNode }) =>
      isValidElement(render)
        ? cloneElement(render, {}, children)
        : createElement("button", null, children),
  };
});

vi.mock("../overview/metric-chart", async () => {
  const { createElement } = await import("react");
  return { MetricChart: () => createElement("div", { "data-metric-chart": true }) };
});

const decodeStatus = Schema.decodeUnknownSync(PublicStatusResponse);

describe("StatusPage chart layout", () => {
  beforeEach(() => {
    testState.data = decodeStatus({
      schemaVersion: 1,
      status: "operational",
      summary: "Clear is operating normally.",
      version: "f001cf7ef243",
      checkedAt: "2026-08-31T04:31:45.855Z",
      components: [
        {
          key: "api",
          name: "API",
          status: "operational",
          summary: "The Clear API is responding normally.",
          observedAt: "2026-08-31T04:31:45.855Z",
        },
        {
          key: "telemetry",
          name: "Telemetry intake",
          status: "operational",
          summary: "OpenTelemetry signals are arriving normally.",
          observedAt: "2026-08-31T04:31:45.194Z",
        },
        {
          key: "storage",
          name: "Storage",
          status: "operational",
          summary: "Operational data stores responded normally.",
          observedAt: "2026-08-31T04:31:45.855Z",
        },
      ],
      metrics: [
        {
          key: "request-rate",
          title: "Request rate",
          description: "Recent request volume across Clear services.",
          unit: "requests/s",
          status: "ready",
          series: [
            {
              label: "Clear API",
              points: [{ at: "2026-08-31T04:31:40.000Z", value: 0.4 }],
            },
          ],
        },
        {
          key: "p95-latency",
          title: "P95 latency",
          description: "Recent request latency across Clear services.",
          unit: "ms",
          status: "ready",
          series: [
            {
              label: "Clear API",
              points: [{ at: "2026-08-31T04:31:40.000Z", value: 50 }],
            },
          ],
        },
      ],
    });
  });

  it("places every chart in a bounded status-only slot", () => {
    const html = renderToStaticMarkup(<StatusPage />);

    expect(html.match(/data-status-chart-slot/g)).toHaveLength(2);
    expect(html.match(/data-metric-chart/g)).toHaveLength(2);
    expect(statusChartSlotHeight).toBe(250);
  });

  it("shows a compact retrieval error instead of an empty chart when storage is unavailable", () => {
    testState.data = decodeStatus({
      schemaVersion: 1,
      status: "degraded",
      summary: "Clear is operating with a delayed or unavailable dependency.",
      version: "f001cf7ef243",
      checkedAt: "2026-08-31T04:31:45.855Z",
      components: [
        {
          key: "api",
          name: "API",
          status: "operational",
          summary: "The Clear API is responding normally.",
          observedAt: "2026-08-31T04:31:45.855Z",
        },
        {
          key: "telemetry",
          name: "Telemetry intake",
          status: "operational",
          summary: "OpenTelemetry metrics are arriving normally.",
          observedAt: "2026-08-31T04:31:45.194Z",
        },
        {
          key: "storage",
          name: "Storage",
          status: "unavailable",
          summary: "One or more operational data stores did not respond normally.",
          observedAt: null,
        },
      ],
      metrics: [
        {
          key: "request-rate",
          title: "Request rate",
          description: "Recent request volume across Clear services.",
          unit: "requests/s",
          status: "not-observed",
          series: [],
        },
        {
          key: "p95-latency",
          title: "P95 latency",
          description: "Recent request latency across Clear services.",
          unit: "ms",
          status: "not-observed",
          series: [],
        },
      ],
    });

    const html = renderToStaticMarkup(<StatusPage />);

    expect(html.match(/Recent samples unavailable/g)).toHaveLength(2);
    expect(html).not.toContain("This signal will appear after the next telemetry export.");
    expect(statusMetricEmptyHeight).toBe(132);
  });
});
