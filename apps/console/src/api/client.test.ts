import { CreateAlertRequest, CreateIngestKeyRequest } from "@groundtruth/api-contract";
import { AlertId, IngestKeyName, ProjectId } from "@groundtruth/domain";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Schema } from "effect";
import { makeBrowserApiClient } from "./client";
import { ConsoleUnavailable } from "../errors";

const projectId = Schema.decodeUnknownSync(ProjectId)("01890f6e-7c00-7000-8000-000000000001");

const makeSessionStorage = (initial: Readonly<Record<string, string>> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe.sequential("browser API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the generated contract client with credentials and access middleware", async () => {
    const alertId = Schema.decodeUnknownSync(AlertId)("01890f6e-7c00-7000-8000-000000000003");
    const requests: Array<Request> = [];
    let expectedCredentials: RequestCredentials = "include";
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      expect(init?.credentials).toBe(expectedCredentials);
      expect(new Headers(init?.headers).get("x-groundtruth-sandbox-session")).toBe("sandbox-1");
      if (request.method === "DELETE") return new Response(null, { status: 204 });
      if (request.method === "POST") {
        if (new URL(request.url).pathname.endsWith("/ingest-keys")) {
          return new Response(
            JSON.stringify({
              metadata: {
                id: "01890f6e-7c00-7000-8000-000000000004",
                projectId,
                name: "primary-exporter",
                prefix: "gtik_abc123def456",
                status: "active",
                createdAt: "2026-08-30T06:00:00.000Z",
                lastUsedAt: null,
                revokedAt: null,
              },
              key: `gtik_abc123def456_${"a".repeat(43)}`,
            }),
            { status: 201, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            id: alertId,
            projectId,
            name: "Checkout latency",
            serviceName: "checkout-api",
            metricName: "http.server.duration",
            aggregation: "p95",
            comparison: "above",
            threshold: 250,
            windowSeconds: 300,
            severity: "warning",
            status: "healthy",
            summary: null,
            enabled: true,
            firingSince: null,
            resolvedAt: null,
            createdAt: "2026-08-28T06:00:00.000Z",
            updatedAt: "2026-08-28T06:00:00.000Z",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetch);

    const sessionStorage = makeSessionStorage({
      "groundtruth.sandboxSessionId": "sandbox-1",
    });
    const api = await makeBrowserApiClient({
      baseUrl: "https://api.groundtruth.test",
      sessionStorage,
    });
    const services = await api.run(api.client.overview.listServices({ params: { projectId } }));
    const payload = Schema.decodeUnknownSync(CreateAlertRequest)({
      name: "Checkout latency",
      serviceName: "checkout-api",
      metricName: "http.server.duration",
      aggregation: "p95",
      comparison: "above",
      threshold: 250,
      windowSeconds: 300,
      severity: "warning",
      enabled: true,
    });
    await api.run(api.client.alerts.createAlert({ params: { projectId }, payload }));
    await api.run(
      api.client.ingestKeys.createIngestKey({
        params: { projectId },
        payload: CreateIngestKeyRequest.make({
          name: IngestKeyName.make("primary-exporter"),
        }),
      }),
    );
    await api.run(api.client.alerts.deleteAlert({ params: { projectId, alertId } }));

    expect(services).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(4);
    const request = fetch.mock.calls[0]?.[0];
    const requestUrl =
      typeof request === "string" ? request : request instanceof URL ? request.href : request?.url;
    expect(requestUrl).toBe(`https://api.groundtruth.test/v1/projects/${projectId}/services`);
    expect(requests.map((item) => [item.method, new URL(item.url).pathname])).toEqual([
      ["GET", `/v1/projects/${projectId}/services`],
      ["POST", `/v1/projects/${projectId}/alerts`],
      ["POST", `/v1/projects/${projectId}/ingest-keys`],
      ["DELETE", `/v1/projects/${projectId}/alerts/${alertId}`],
    ]);
    await expect(requests[1]?.clone().json()).resolves.toMatchObject({
      metricName: "http.server.duration",
      enabled: true,
    });
    await expect(requests[2]?.clone().json()).resolves.toEqual({ name: "primary-exporter" });

    expectedCredentials = "omit";
    const demoApi = await makeBrowserApiClient({
      baseUrl: "https://api.groundtruth.test",
      forceSandbox: true,
      sessionStorage,
    });
    await demoApi.run(demoApi.client.overview.listServices({ params: { projectId } }));

    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("persists and clears the per-tab sandbox session", async () => {
    const sessionStorage = makeSessionStorage();
    const api = await makeBrowserApiClient({
      baseUrl: "https://api.groundtruth.test",
      sessionStorage,
    });

    api.access.setSandboxSessionId("sandbox-2");
    expect(sessionStorage.getItem("groundtruth.sandboxSessionId")).toBe("sandbox-2");

    api.access.setSandboxSessionId(null);
    expect(sessionStorage.getItem("groundtruth.sandboxSessionId")).toBeNull();
  });

  it("normalizes browser transport failures before leaving Effect", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const api = await makeBrowserApiClient({
      baseUrl: "https://api.groundtruth.test",
      sessionStorage: makeSessionStorage(),
    });

    await expect(
      api.run(api.client.overview.listServices({ params: { projectId } })),
    ).rejects.toBeInstanceOf(ConsoleUnavailable);
    expect(consoleError).toHaveBeenCalledWith(
      "[Clear] API request failed",
      expect.objectContaining({ cause: expect.anything() }),
    );
    consoleError.mockRestore();
  });
});
