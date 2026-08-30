import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { emitExample } from "../src/index.ts";

const listen = (server: ReturnType<typeof createServer>) =>
  new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        resolve(address.port);
        return;
      }
      reject(new Error("The test OTLP receiver did not bind to a TCP port"));
    });
  });

const close = (server: ReturnType<typeof createServer>) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the Node OpenTelemetry example", () => {
  it("exports non-empty protobuf payloads for all three OTLP signals", async () => {
    const requests = new Map<
      string,
      { body: Buffer; contentType: string | undefined; token: string | undefined }
    >();
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        requests.set(request.url ?? "", {
          body: Buffer.concat(chunks),
          contentType: request.headers["content-type"],
          token: request.headers["x-example-token"] as string | undefined,
        });
        response.writeHead(200, { "content-type": "application/x-protobuf" });
        response.end();
      });
    });
    const port = await listen(server);

    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", `http://127.0.0.1:${port}`);
    vi.stubEnv("OTEL_EXPORTER_OTLP_HEADERS", "x-example-token=secret");
    vi.stubEnv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf");
    vi.stubEnv("OTEL_SERVICE_NAME", "node-otel-test");

    try {
      await emitExample();
    } finally {
      await close(server);
    }

    expect([...requests.keys()].sort()).toEqual(["/v1/logs", "/v1/metrics", "/v1/traces"]);
    for (const request of requests.values()) {
      expect(request.body.byteLength).toBeGreaterThan(0);
      expect(request.contentType).toBe("application/x-protobuf");
      expect(request.token).toBe("secret");
    }
  });
});
