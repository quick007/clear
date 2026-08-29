// Persistence owns the pinned PostgreSQL driver used by this deployment probe.
import pg from "../../packages/persistence/node_modules/pg/lib/index.js";

const transientExit = 75;
const configurationExit = 78;
const softwareExit = 70;
const timeoutMs = 3_000; // 3 seconds

const transientNetworkCodes = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
]);

const errorCode = (error) => {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return errorCode(error.cause);
  return undefined;
};

const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

const isTransientNetworkError = (error) => {
  const code = errorCode(error);
  if (code !== undefined && transientNetworkCodes.has(code)) return true;
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
};

const reportFailure = (store, error, exitCode) => {
  console.error(`${store} readiness failed: ${errorMessage(error)}`);
  process.exitCode = exitCode;
};

const requireEnvironment = (name) => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const checkPostgres = async () => {
  let connectionString;
  try {
    connectionString = requireEnvironment("GROUNDTRUTH_POSTGRES_URL");
    new URL(connectionString);
  } catch (error) {
    reportFailure("PostgreSQL", error, configurationExit);
    return;
  }

  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: timeoutMs, max: 1 });
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    const code = errorCode(error);
    if (isTransientNetworkError(error) || code?.startsWith("08") === true) {
      reportFailure("PostgreSQL", error, transientExit);
    } else if (code === "57P03" || code === "53300") {
      reportFailure("PostgreSQL", error, transientExit);
    } else if (code?.startsWith("28") === true) {
      reportFailure("PostgreSQL", error, configurationExit);
    } else {
      reportFailure("PostgreSQL", error, softwareExit);
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
};

const clickhouseEndpoint = () => {
  const configured =
    process.env.GROUNDTRUTH_CLICKHOUSE_URL ??
    (process.env.GROUNDTRUTH_CLICKHOUSE_HOSTPORT === undefined
      ? undefined
      : `http://${process.env.GROUNDTRUTH_CLICKHOUSE_HOSTPORT}`);
  if (configured === undefined || configured.length === 0) {
    throw new Error("GROUNDTRUTH_CLICKHOUSE_URL or GROUNDTRUTH_CLICKHOUSE_HOSTPORT is required");
  }

  const endpoint = new URL(configured);
  endpoint.searchParams.set("query", "SELECT 1");
  endpoint.searchParams.set(
    "database",
    process.env.GROUNDTRUTH_CLICKHOUSE_DATABASE ?? "groundtruth",
  );
  return endpoint;
};

const checkClickHouse = async () => {
  let endpoint;
  let authorization;
  try {
    endpoint = clickhouseEndpoint();
    const username = requireEnvironment("GROUNDTRUTH_CLICKHOUSE_USER");
    const password = requireEnvironment("GROUNDTRUTH_CLICKHOUSE_PASSWORD");
    authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  } catch (error) {
    reportFailure("ClickHouse", error, configurationExit);
    return;
  }

  try {
    const response = await fetch(endpoint, {
      headers: { authorization },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return;

    const detail = (await response.text()).trim();
    const error = new Error(`HTTP ${response.status}${detail.length === 0 ? "" : `: ${detail}`}`);
    if (
      response.status === 429 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      reportFailure("ClickHouse", error, transientExit);
    } else if (response.status === 401 || response.status === 403) {
      reportFailure("ClickHouse", error, configurationExit);
    } else {
      reportFailure("ClickHouse", error, softwareExit);
    }
  } catch (error) {
    reportFailure(
      "ClickHouse",
      error,
      isTransientNetworkError(error) ? transientExit : softwareExit,
    );
  }
};

const store = process.argv[2];
if (store === "postgres") await checkPostgres();
else if (store === "clickhouse") await checkClickHouse();
else {
  console.error("Usage: node check-database-readiness.mjs <postgres|clickhouse>");
  process.exitCode = configurationExit;
}
