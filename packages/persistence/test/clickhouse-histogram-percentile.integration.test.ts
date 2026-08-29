import { ProjectId } from "@groundtruth/domain";
import { CanonicalTelemetryBatch, MetricQuery } from "@groundtruth/telemetry";
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

const projectId = Schema.decodeUnknownSync(ProjectId)("0198f1a2-3b4c-7def-a123-456789abcdef");
const ClickHouseTestDatabaseLive = ClickHouseLive.pipe(
  Layer.provide(ClickHouseTestInfrastructureLive),
);
const MigratedClickHouseTestDatabaseLive = Layer.effectDiscard(runClickHouseMigrations).pipe(
  Layer.provideMerge(ClickHouseTestDatabaseLive),
);
const TelemetryRepositoryTestLive = TelemetryRepositoryLive.pipe(
  Layer.provideMerge(MigratedClickHouseTestDatabaseLive),
);

const makeFixture = (incompatibleBounds = false) => {
  const baseMillis = Math.floor(Date.now() / 10_000) * 10_000;
  const baseNano = BigInt(baseMillis) * 1_000_000n;
  const resource = {
    attributes: { "service.name": "latency-service" },
    droppedAttributesCount: "0",
    entityRefs: [],
    schemaUrl: null,
  } as const;
  const scope = {
    name: "groundtruth.histogram-test",
    version: "1.0.0",
    attributes: {},
    droppedAttributesCount: "0",
    schemaUrl: null,
  } as const;
  const histogram = (
    timeUnixNano: bigint,
    bucketCounts: ReadonlyArray<string>,
    sum: number,
    maximum: number,
    explicitBounds: ReadonlyArray<number> = [10, 100],
  ) => ({
    _tag: "histogram",
    name: "request.duration",
    description: "Request duration",
    unit: "ms",
    metadata: {},
    resource,
    scope,
    serviceName: "latency-service",
    startTimeUnixNano: baseNano.toString(),
    timeUnixNano: timeUnixNano.toString(),
    attributes: { route: "/checkout" },
    exemplars: [],
    flags: 0,
    temporality: "delta",
    count: "50",
    sum,
    minimum: 1,
    maximum,
    explicitBounds,
    bucketCounts,
  });
  const batch = Schema.decodeUnknownSync(CanonicalTelemetryBatch)({
    id: incompatibleBounds
      ? "750e8400-e29b-41d4-a716-446655440001"
      : "750e8400-e29b-41d4-a716-446655440000",
    receivedAt: new Date().toISOString(),
    metrics: [
      histogram(baseNano + 1_000_000_000n, ["45", "4", "1"], 1_245, 1_000),
      histogram(
        baseNano + 2_000_000_000n,
        ["45", "5", "0"],
        295,
        50,
        incompatibleBounds ? [20, 100] : [10, 100],
      ),
    ],
    logs: [],
    spans: [],
  });
  const range = {
    _tag: "absolute",
    start: new Date(baseMillis).toISOString(),
    end: new Date(baseMillis + 9_000).toISOString(),
  } as const;
  return { batch, range };
};

describe.skipIf(!databaseTestsEnabled)("ClickHouse explicit histogram percentiles", () => {
  const runtime = ManagedRuntime.make(TelemetryRepositoryTestLive);

  beforeAll(() => runtime.runPromise(Effect.void), startupTimeout);
  afterAll(() => runtime.dispose(), shutdownTimeout);

  it(
    "merges bucket counts and approximates p95 from the distribution instead of its mean",
    async () => {
      const { batch, range } = makeFixture();
      await runtime.runPromise(
        Effect.gen(function* () {
          const telemetry = yield* TelemetryRepository;
          yield* telemetry.ingest(projectId, 7, batch);
          const query = (aggregation: "avg" | "p95") =>
            Schema.decodeUnknownSync(MetricQuery)({
              metric: "request.duration",
              aggregation,
              range,
              step: "10s",
            });

          const average = yield* telemetry.queryMetrics(projectId, query("avg"));
          const percentile = yield* telemetry.queryMetrics(projectId, query("p95"));

          expect(average.series[0]?.points[0]?.value).toBeCloseTo(15.4);
          // Nearest-rank p95 lands halfway through the merged [10, 100] bucket.
          expect(percentile.series[0]?.points[0]?.value).toBeCloseTo(60);
          expect(percentile.series[0]?.points[0]?.value).not.toBeCloseTo(15.4);
          yield* telemetry.purgeProject(projectId);
        }),
      );
    },
    testTimeout,
  );

  it(
    "rejects incompatible explicit bounds without retrying or returning a mean",
    async () => {
      const { batch, range } = makeFixture(true);
      await runtime.runPromise(
        Effect.gen(function* () {
          const telemetry = yield* TelemetryRepository;
          yield* telemetry.ingest(projectId, 7, batch);
          const error = yield* Effect.flip(
            telemetry.queryMetrics(
              projectId,
              Schema.decodeUnknownSync(MetricQuery)({
                metric: "request.duration",
                aggregation: "p95",
                range,
                step: "10s",
              }),
            ),
          );

          expect(error._tag).toBe("PersistenceError");
          expect(error.operation).toBe("query-metrics-percentile-incompatible-bounds");
          expect(error.retryable).toBe(false);
          yield* telemetry.purgeProject(projectId);
        }),
      );
    },
    testTimeout,
  );
});
