import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { makePublicApiClient } from "./public-client";

const statusResponse = {
  schemaVersion: 1,
  status: "operational",
  summary: "Clear is receiving and serving telemetry normally.",
  version: "abc1234",
  checkedAt: "2026-08-30T06:00:00.000Z",
  components: [
    {
      key: "api",
      name: "API",
      status: "operational",
      summary: "Public requests are being served.",
      observedAt: "2026-08-30T06:00:00.000Z",
    },
    {
      key: "telemetry",
      name: "Telemetry intake",
      status: "operational",
      summary: "Recent telemetry has been received.",
      observedAt: "2026-08-30T05:59:58.000Z",
    },
    {
      key: "storage",
      name: "Storage",
      status: "operational",
      summary: "Status data is available.",
      observedAt: "2026-08-30T06:00:00.000Z",
    },
  ],
  metrics: [
    {
      key: "request-rate",
      title: "Request rate",
      description: "Requests handled by Clear services.",
      unit: "requests/s",
      status: "ready",
      series: [
        {
          label: "Clear API",
          points: [{ at: "2026-08-30T06:00:00.000Z", value: 12 }],
        },
      ],
    },
    {
      key: "p95-latency",
      title: "P95 latency",
      description: "Tail response time across Clear services.",
      unit: "ms",
      status: "not-observed",
      series: [],
    },
  ],
};

describe.sequential("public API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads the bounded status endpoint without credentials or project access headers", async () => {
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(init?.credentials).toBe("omit");
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.headers.get("x-groundtruth-sandbox-session")).toBeNull();
      return new Response(JSON.stringify(statusResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetch);

    const client = await makePublicApiClient({ baseUrl: "https://api.clear.test" });
    const status = await client.getStatus();

    expect(status).toMatchObject({ schemaVersion: 1, status: "operational" });
    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0]?.[0];
    const url =
      typeof request === "string" ? request : request instanceof URL ? request.href : request?.url;
    expect(url).toBe("https://api.clear.test/v1/public/status");
  });
});
