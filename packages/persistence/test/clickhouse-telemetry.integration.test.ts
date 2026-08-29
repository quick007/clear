import { ProjectId } from "@groundtruth/domain";
import {
  CanonicalTelemetryBatch,
  LogSearch,
  MetricQuery,
  TelemetryBytes,
  TelemetryInteger,
  TraceId,
  TraceSearch,
} from "@groundtruth/telemetry";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { ClickHouseLive } from "../src/clickhouse/client.ts";
import { runClickHouseMigrations } from "../src/clickhouse/migrate.ts";
import {
  TelemetryRepository,
  TelemetryRepositoryLive,
} from "../src/clickhouse/telemetry-repository.ts";
import { ClickHouseTestInfrastructureLive } from "../src/testing/containers.ts";

const databaseTestsEnabled = ["1", "true"].includes(
  process.env.GROUNDTRUTH_RUN_DATABASE_TESTS?.toLowerCase() ?? "",
);
const startupTimeout = 5 * 60_000; // 5 minutes
const shutdownTimeout = 30_000; // 30 seconds
const testTimeout = 60_000; // 1 minute

const projectId = Schema.decodeUnknownSync(ProjectId)("0198f1a2-3b4c-7def-8123-456789abcdef");
const otherProjectId = Schema.decodeUnknownSync(ProjectId)("0198f1a2-3b4c-7def-9234-56789abcdef0");
const traceId = Schema.decodeUnknownSync(TraceId)("4bf92f3577b34da6a3ce929d0e0e4736");
const spanId = "00f067aa0ba902b7";

const ClickHouseTestDatabaseLive = ClickHouseLive.pipe(
  Layer.provide(ClickHouseTestInfrastructureLive),
);
const MigratedClickHouseTestDatabaseLive = Layer.effectDiscard(runClickHouseMigrations).pipe(
  Layer.provideMerge(ClickHouseTestDatabaseLive),
);
const TelemetryRepositoryTestLive = TelemetryRepositoryLive.pipe(
  Layer.provideMerge(MigratedClickHouseTestDatabaseLive),
);

const makeFixture = () => {
  const pointTime = BigInt(Date.now()) * 1_000_000n;
  const spanEnd = pointTime + 150_000_000n;
  const windowStart = new Date(Number(pointTime / 1_000_000n) - 60_000).toISOString();
  const windowEnd = new Date(Number(pointTime / 1_000_000n) + 60_000).toISOString();
  const resource = {
    attributes: {
      "service.name": "checkout-api",
      exact: { _tag: "int", value: "9007199254740993" },
      binary: { _tag: "bytes", value: "AQID" },
      nested: { region: "sea", active: true },
    },
    droppedAttributesCount: "2",
    entityRefs: [
      {
        schemaUrl: null,
        type: "service",
        idKeys: ["service.name"],
        descriptionKeys: [],
      },
    ],
    schemaUrl: "https://opentelemetry.io/schemas/1.27.0",
  };
  const scope = {
    name: "groundtruth.integration",
    version: "1.0.0",
    attributes: { library: "test" },
    droppedAttributesCount: "1",
    schemaUrl: null,
  };
  const metricBase = {
    _tag: "gauge",
    name: "http.server.requests",
    description: "Completed requests",
    unit: "{request}",
    metadata: {
      exact: { _tag: "int", value: "9007199254740993" },
      binary: { _tag: "bytes", value: "AQID" },
    },
    resource,
    scope,
    serviceName: "checkout-api",
    startTimeUnixNano: null,
    timeUnixNano: pointTime.toString(),
    exemplars: [],
    flags: 0,
    value: { _tag: "int", value: "9007199254740993" },
  } as const;

  const batch = Schema.decodeUnknownSync(CanonicalTelemetryBatch)({
    id: "550e8400-e29b-41d4-a716-446655440000",
    receivedAt: new Date().toISOString(),
    metrics: [
      { ...metricBase, attributes: { "user.id": "alpha", retry: false } },
      { ...metricBase, attributes: { "user.id": "beta", retry: true } },
      { ...metricBase, attributes: { "user.id": "alpha", retry: true } },
    ],
    logs: [
      {
        timeUnixNano: pointTime.toString(),
        observedTimeUnixNano: (pointTime + 1_000n).toString(),
        traceId,
        spanId,
        flags: 1,
        severity: "error",
        severityNumber: 17,
        severityText: "ERROR",
        body: {
          message: "payment failed",
          exact: { _tag: "int", value: "9007199254740993" },
          binary: { _tag: "bytes", value: "AQID" },
        },
        eventName: "payment.failed",
        attributes: { retry: true },
        droppedAttributesCount: "3",
        resource,
        scope,
        serviceName: "checkout-api",
      },
      {
        timeUnixNano: (pointTime + 2_000n).toString(),
        observedTimeUnixNano: (pointTime + 3_000n).toString(),
        traceId: null,
        spanId: null,
        flags: 0,
        severity: "info",
        severityNumber: 9,
        severityText: "INFO",
        body: "worker heartbeat",
        eventName: null,
        attributes: {},
        droppedAttributesCount: "0",
        resource: {
          ...resource,
          attributes: { ...resource.attributes, "service.name": "worker" },
        },
        scope,
        serviceName: "worker",
      },
    ],
    spans: [
      {
        traceId,
        spanId,
        parentSpanId: null,
        traceState: "vendor=value",
        flags: 1,
        name: "POST /checkout",
        kind: "server",
        startTimeUnixNano: pointTime.toString(),
        endTimeUnixNano: spanEnd.toString(),
        durationNanos: "150000000",
        status: { code: "error", message: "upstream unavailable" },
        attributes: { route: "/checkout", retry: true },
        droppedAttributesCount: "4",
        events: [
          {
            name: "retry",
            timeUnixNano: (pointTime + 50_000_000n).toString(),
            attributes: { attempt: { _tag: "int", value: "9007199254740993" } },
            droppedAttributesCount: "5",
          },
        ],
        droppedEventsCount: "6",
        links: [
          {
            traceId: "11111111111111111111111111111111",
            spanId: "1111111111111111",
            traceState: "",
            attributes: { binary: { _tag: "bytes", value: "AQID" } },
            droppedAttributesCount: "7",
            flags: 2,
          },
        ],
        droppedLinksCount: "8",
        resource,
        scope,
        serviceName: "checkout-api",
      },
    ],
  });
  const range = { _tag: "absolute", start: windowStart, end: windowEnd } as const;
  return { batch, range };
};

const expectExactTelemetryValues = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected structured telemetry value");
  }
  if (!("exact" in value) || !("binary" in value)) {
    throw new TypeError("Expected exact and binary telemetry fields");
  }
  expect(value.exact).toBeInstanceOf(TelemetryInteger);
  expect(value.binary).toBeInstanceOf(TelemetryBytes);
  if (value.exact instanceof TelemetryInteger) {
    expect(value.exact.value).toBe(9_007_199_254_740_993n);
  }
  if (value.binary instanceof TelemetryBytes) {
    expect([...value.binary.value]).toEqual([1, 2, 3]);
  }
};

const makeRateFixture = () => {
  const baseMillis = Math.floor(Date.now() / 10_000) * 10_000 - 40_000;
  const baseNano = BigInt(baseMillis) * 1_000_000n;
  const tenSeconds = 10_000_000_000n; // 10 seconds
  const cumulativeStart = baseNano - 60_000_000_000n; // 1 minute before the first point
  const resetAt = baseNano + 2n * tenSeconds;
  const resource = {
    attributes: { "service.name": "counter-service" },
    droppedAttributesCount: "0",
    entityRefs: [],
    schemaUrl: null,
  } as const;
  const scope = {
    name: "groundtruth.rate-test",
    version: "1.0.0",
    attributes: {},
    droppedAttributesCount: "0",
    schemaUrl: null,
  } as const;
  const point = (
    name: string,
    value: number,
    time: bigint,
    start: bigint,
    temporality: string,
  ) => ({
    _tag: "sum",
    name,
    description: "Request counter",
    unit: "{request}",
    metadata: {},
    resource,
    scope,
    serviceName: "counter-service",
    startTimeUnixNano: start.toString(),
    timeUnixNano: time.toString(),
    attributes: { route: "/checkout" },
    exemplars: [],
    flags: 0,
    value: { _tag: "int", value: String(value) },
    temporality,
    monotonic: true,
  });
  const batch = Schema.decodeUnknownSync(CanonicalTelemetryBatch)({
    id: "650e8400-e29b-41d4-a716-446655440000",
    receivedAt: new Date().toISOString(),
    metrics: [
      point("requests.cumulative", 100, baseNano, cumulativeStart, "cumulative"),
      point("requests.cumulative", 110, baseNano + tenSeconds, cumulativeStart, "cumulative"),
      point("requests.cumulative", 5, resetAt, resetAt, "cumulative"),
      point("requests.cumulative", 15, baseNano + 3n * tenSeconds, resetAt, "cumulative"),
      point("requests.delta", 10, baseNano, baseNano, "delta"),
      point("requests.delta", 20, baseNano + tenSeconds, baseNano, "delta"),
    ],
    logs: [],
    spans: [],
  });
  const range = {
    _tag: "absolute",
    start: new Date(baseMillis - 1_000).toISOString(),
    end: new Date(baseMillis + 31_000).toISOString(),
  } as const;
  return { batch, range };
};

describe.skipIf(!databaseTestsEnabled)("ClickHouse telemetry repository", () => {
  const runtime = ManagedRuntime.make(TelemetryRepositoryTestLive);

  beforeAll(() => runtime.runPromise(Effect.void), startupTimeout);
  afterAll(() => runtime.dispose(), shutdownTimeout);

  it(
    "round-trips canonical signals, isolates projects, and purges synchronously",
    async () => {
      const { batch, range } = makeFixture();
      await runtime.runPromise(
        Effect.gen(function* () {
          const telemetry = yield* TelemetryRepository;
          yield* telemetry.ingest(projectId, 7, batch);
          yield* telemetry.ingest(projectId, 7, batch);

          const catalog = yield* telemetry.listMetrics(projectId);
          expect(catalog).toHaveLength(1);
          expectExactTelemetryValues(catalog[0]?.metadata);

          const services = yield* telemetry.listServices(projectId);
          expect(services.map(({ name }) => String(name))).toEqual(["checkout-api", "worker"]);
          expect(services[0]?.signals).toMatchObject({ metrics: true, logs: true, traces: true });
          expect(services[1]?.signals).toMatchObject({ metrics: false, logs: true, traces: false });
          const activity = yield* telemetry.listSignalActivity(projectId);
          expect(activity.map(({ signal, itemCount }) => [signal, itemCount])).toEqual([
            ["metrics", 3],
            ["logs", 2],
            ["traces", 1],
          ]);

          const distinct = yield* telemetry.queryMetrics(
            projectId,
            Schema.decodeUnknownSync(MetricQuery)({
              metric: "http.server.requests",
              aggregation: "count-distinct",
              distinctKey: "user.id",
              range,
              step: "10s",
              filters: [{ key: "service.name", operator: "equals", value: "checkout-api" }],
              groupBy: ["service.name"],
            }),
          );
          expect(distinct.series).toHaveLength(1);
          expect(distinct.series[0]?.points[0]?.value).toBe(2);
          expect(distinct.series[0]?.attributes).toEqual({ "service.name": "checkout-api" });

          const sevenDayRollup = yield* telemetry.queryMetrics(
            projectId,
            Schema.decodeUnknownSync(MetricQuery)({
              metric: "http.server.requests",
              aggregation: "count",
              range: { _tag: "relative", window: "7d" },
              filters: [{ key: "service.name", operator: "equals", value: "checkout-api" }],
              groupBy: ["service.name"],
            }),
          );
          expect(sevenDayRollup.series).toHaveLength(1);
          expect(sevenDayRollup.series[0]?.points[0]?.value).toBe(3);
          expect(sevenDayRollup.series[0]?.attributes).toEqual({
            "service.name": "checkout-api",
          });

          const logs = yield* telemetry.searchLogs(
            projectId,
            Schema.decodeUnknownSync(LogSearch)({
              range,
              limit: 10,
              filters: [{ key: "service.name", operator: "equals", value: "checkout-api" }],
            }),
          );
          expect(logs.records).toHaveLength(1);
          expect(logs.records[0]?.droppedAttributesCount).toBe(3n);
          expectExactTelemetryValues(logs.records[0]?.body);
          expectExactTelemetryValues(logs.records[0]?.resource.attributes);

          const malformedCursor = Buffer.from("not-json", "utf8").toString("base64url");
          const cursorError = yield* Effect.flip(
            telemetry.searchLogs(
              projectId,
              Schema.decodeUnknownSync(LogSearch)({ range, cursor: malformedCursor, limit: 10 }),
            ),
          );
          expect(cursorError._tag).toBe("InvalidCursor");

          const traces = yield* telemetry.searchTraces(
            projectId,
            Schema.decodeUnknownSync(TraceSearch)({
              range,
              limit: 10,
              filters: [{ key: "service.name", operator: "equals", value: "checkout-api" }],
            }),
          );
          expect(traces.traces).toHaveLength(1);
          expect(traces.traces[0]?.durationMs).toBe(150);

          const trace = yield* telemetry.getTrace(projectId, batch.spans[0]?.traceId ?? traceId);
          expect(trace?.spans).toHaveLength(1);
          expect(trace?.correlatedLogs).toHaveLength(1);
          expect(trace?.spans[0]?.events[0]?.droppedAttributesCount).toBe(5n);
          expect(trace?.spans[0]?.links[0]?.droppedAttributesCount).toBe(7n);
          expectExactTelemetryValues(trace?.spans[0]?.resource.attributes);

          expect(yield* telemetry.listMetrics(otherProjectId)).toHaveLength(0);
          expect(
            yield* telemetry.getTrace(otherProjectId, batch.spans[0]?.traceId ?? traceId),
          ).toBe(null);

          yield* telemetry.purgeProject(projectId);
          expect(yield* telemetry.listMetrics(projectId)).toHaveLength(0);
          expect(yield* telemetry.getTrace(projectId, batch.spans[0]?.traceId ?? traceId)).toBe(
            null,
          );
        }),
      );
    },
    testTimeout,
  );

  it(
    "differences cumulative rates, handles resets, and preserves delta contributions",
    async () => {
      const { batch, range } = makeRateFixture();
      await runtime.runPromise(
        Effect.gen(function* () {
          const telemetry = yield* TelemetryRepository;
          yield* telemetry.ingest(otherProjectId, 7, batch);
          const query = (metric: string) =>
            Schema.decodeUnknownSync(MetricQuery)({
              metric,
              aggregation: "rate",
              range,
              step: "10s",
            });

          const cumulative = yield* telemetry.queryMetrics(
            otherProjectId,
            query("requests.cumulative"),
          );
          expect(cumulative.series[0]?.points.map(({ value }) => value)).toEqual([1, 0.5, 1]);

          const delta = yield* telemetry.queryMetrics(otherProjectId, query("requests.delta"));
          expect(delta.series[0]?.points.map(({ value }) => value)).toEqual([1, 2]);

          const encoded = Schema.encodeSync(CanonicalTelemetryBatch)(batch);
          const futureTime = BigInt(Date.now() + 11 * 60_000) * 1_000_000n; // 11 minutes
          const futureBatch = Schema.decodeUnknownSync(CanonicalTelemetryBatch)({
            ...encoded,
            id: "750e8400-e29b-41d4-a716-446655440000",
            metrics: [{ ...encoded.metrics[0], timeUnixNano: futureTime.toString() }],
            logs: [],
            spans: [],
          });
          const skewError = yield* Effect.flip(telemetry.ingest(otherProjectId, 7, futureBatch));
          expect(skewError._tag).toBe("PersistenceError");
          if (skewError._tag === "PersistenceError") expect(skewError.retryable).toBe(false);
          const retentionError = yield* Effect.flip(telemetry.ingest(otherProjectId, 0, batch));
          expect(retentionError._tag).toBe("PersistenceError");
          if (retentionError._tag === "PersistenceError")
            expect(retentionError.retryable).toBe(false);
          yield* telemetry.sealAndPurgeProject(otherProjectId);
          const sealedError = yield* Effect.flip(telemetry.ingest(otherProjectId, 7, batch));
          expect(sealedError._tag).toBe("PersistenceError");
          if (sealedError._tag === "PersistenceError") expect(sealedError.retryable).toBe(false);
        }),
      );
    },
    testTimeout,
  );
});
