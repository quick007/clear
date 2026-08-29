import { ProjectId } from "@groundtruth/domain";
import { CanonicalTelemetryBatch, LogSearch, TraceSearch } from "@groundtruth/telemetry";
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
const projectId = Schema.decodeUnknownSync(ProjectId)("0198f1a2-3b4c-7def-b123-456789abcdef");

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
  const baseNano = BigInt(Date.now()) * 1_000_000n;
  const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
  const rootSpanId = "00f067aa0ba902b7";
  const childSpanId = "11f067aa0ba902b7";
  const resource = {
    attributes: { "service.name": "checkout-api", region: "sea" },
    droppedAttributesCount: "0",
    entityRefs: [],
    schemaUrl: null,
  } as const;
  const scope = {
    name: "groundtruth.search-test",
    version: "1.0.0",
    attributes: {},
    droppedAttributesCount: "0",
    schemaUrl: null,
  } as const;
  const duplicateLog = {
    timeUnixNano: baseNano.toString(),
    observedTimeUnixNano: baseNano.toString(),
    traceId,
    spanId: childSpanId,
    flags: 0,
    severity: "error",
    severityNumber: 17,
    severityText: "ERROR",
    body: "duplicate retry log",
    eventName: null,
    attributes: { retry: true },
    droppedAttributesCount: "0",
    resource,
    scope,
    serviceName: "checkout-api",
  } as const;
  const span = (
    spanId: string,
    parentSpanId: string | null,
    name: string,
    start: bigint,
    end: bigint,
    status: "ok" | "error",
  ) => ({
    traceId,
    spanId,
    parentSpanId,
    traceState: "",
    flags: 0,
    name,
    kind: "server",
    startTimeUnixNano: start.toString(),
    endTimeUnixNano: end.toString(),
    durationNanos: (end - start).toString(),
    status: { code: status, message: "" },
    attributes: { route: "/checkout" },
    droppedAttributesCount: "0",
    events: [],
    droppedEventsCount: "0",
    links: [],
    droppedLinksCount: "0",
    resource,
    scope,
    serviceName: "checkout-api",
  });
  const batch = Schema.decodeUnknownSync(CanonicalTelemetryBatch)({
    id: "850e8400-e29b-41d4-a716-446655440000",
    receivedAt: new Date().toISOString(),
    metrics: [],
    logs: [duplicateLog, duplicateLog],
    spans: [
      span(rootSpanId, null, "POST /checkout", baseNano, baseNano + 100_000_000n, "error"),
      span(
        childSpanId,
        rootSpanId,
        "call payments",
        baseNano + 100_000_000n,
        baseNano + 500_000_000n,
        "ok",
      ),
    ],
  });
  const range = {
    _tag: "absolute",
    start: new Date(Number(baseNano / 1_000_000n) - 1_000).toISOString(),
    end: new Date(Number(baseNano / 1_000_000n) + 1_000).toISOString(),
  } as const;
  return { batch, range };
};

describe.skipIf(!databaseTestsEnabled)("ClickHouse search semantics", () => {
  const runtime = ManagedRuntime.make(TelemetryRepositoryTestLive);

  beforeAll(() => runtime.runPromise(Effect.void), startupTimeout);
  afterAll(() => runtime.dispose(), shutdownTimeout);

  it(
    "pages identical logs and applies trace predicates to the complete trace summary",
    async () => {
      const { batch, range } = makeFixture();
      await runtime.runPromise(
        Effect.gen(function* () {
          const telemetry = yield* TelemetryRepository;
          yield* telemetry.ingest(projectId, 7, batch);

          const first = yield* telemetry.searchLogs(
            projectId,
            Schema.decodeUnknownSync(LogSearch)({ range, limit: 1 }),
          );
          expect(first.records).toHaveLength(1);
          expect(first.hasMore).toBe(true);
          expect(first.nextCursor).not.toBe(null);
          const second = yield* telemetry.searchLogs(
            projectId,
            Schema.decodeUnknownSync(LogSearch)({
              range,
              limit: 1,
              cursor: first.nextCursor,
            }),
          );
          expect(second.records).toHaveLength(1);
          expect(second.records[0]?.body).toBe(first.records[0]?.body);
          expect(second.hasMore).toBe(false);

          const trace = yield* telemetry.searchTraces(
            projectId,
            Schema.decodeUnknownSync(TraceSearch)({
              range,
              operation: "payments",
              status: "error",
              minimumDurationMs: 400,
              maximumDurationMs: 600,
              limit: 10,
            }),
          );
          expect(trace.traces).toHaveLength(1);
          expect(trace.traces[0]?.durationMs).toBe(500);
          expect(trace.traces[0]?.status).toBe("error");

          const wrongStatus = yield* telemetry.searchTraces(
            projectId,
            Schema.decodeUnknownSync(TraceSearch)({
              range,
              operation: "payments",
              status: "ok",
              limit: 10,
            }),
          );
          expect(wrongStatus.traces).toHaveLength(0);
          yield* telemetry.purgeProject(projectId);
        }),
      );
    },
    testTimeout,
  );
});
