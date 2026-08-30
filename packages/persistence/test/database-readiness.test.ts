import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vite-plus/test";

const execFilePromise = promisify(execFile);
const readinessScript = fileURLToPath(
  new URL("../../../infra/scripts/check-database-readiness.mjs", import.meta.url),
);
const servers = new Set<ReturnType<typeof createServer>>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error === undefined ? resolve() : reject(error)));
        }),
    ),
  );
  servers.clear();
});

describe("database readiness", () => {
  it("checks ClickHouse before the application database exists", async () => {
    let requestedUrl: string | undefined;
    const server = createServer((request, response) => {
      requestedUrl = request.url;
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("1\n");
    });
    servers.add(server);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Missing server address");

    await execFilePromise(process.execPath, [readinessScript, "clickhouse"], {
      env: {
        ...process.env,
        GROUNDTRUTH_CLICKHOUSE_DATABASE: "groundtruth",
        GROUNDTRUTH_CLICKHOUSE_PASSWORD: "test-password",
        GROUNDTRUTH_CLICKHOUSE_URL: `http://127.0.0.1:${address.port}`,
        GROUNDTRUTH_CLICKHOUSE_USER: "groundtruth",
      },
    });

    expect(requestedUrl).toBeDefined();
    const request = new URL(requestedUrl ?? "", `http://127.0.0.1:${address.port}`);
    expect(request.searchParams.get("query")).toBe("SELECT 1");
    expect(request.searchParams.get("database")).toBe("default");
  });
});
