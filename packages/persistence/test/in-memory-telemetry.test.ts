import { ProjectId } from "@groundtruth/domain";
import { CanonicalTelemetryBatch, LogSearch, MetricQuery } from "@groundtruth/telemetry";
import { DateTime, Effect, Ref, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  emptyTelemetryMemoryState,
  makeInMemoryTelemetryRepository,
} from "../src/testing/in-memory-telemetry.ts";

const projectId = Schema.decodeUnknownSync(ProjectId)("0198f1a2-3b4c-7def-8123-456789abcdef");
const otherProjectId = Schema.decodeUnknownSync(ProjectId)("0198f1a2-3b4c-7def-9234-56789abcdef0");
const baseMillis = Date.parse("2027-01-15T08:00:00.000Z");
const unixNano = (offsetMillis: number) => String(BigInt(baseMillis + offsetMillis) * 1_000_000n);

const scope = {
  name: "groundtruth.memory-test",
  version: null,
  attributes: {},
  droppedAttributesCount: "0",
  schemaUrl: null,
};

const resource = (serviceName: string) => ({
  attributes: { "service.name": serviceName },
  droppedAttributesCount: "0",
  entityRefs: [],
  schemaUrl: null,
});

const metric = (serviceName: string, offsetMillis: number) => ({
  _tag: "gauge" as const,
  name: "http.server.requests",
  description: "Completed requests",
  unit: "{request}",
  metadata: {},
  resource: resource(serviceName),
  scope,
  serviceName,
  startTimeUnixNano: null,
  timeUnixNano: unixNano(offsetMillis),
  attributes: {},
  exemplars: [],
  flags: 0,
  value: { _tag: "int" as const, value: "1" },
});

const log = (serviceName: string, offsetMillis: number) => ({
  timeUnixNano: unixNano(offsetMillis),
  observedTimeUnixNano: unixNano(offsetMillis + 1),
  traceId: null,
  spanId: null,
  flags: 0,
  severity: "info" as const,
  severityNumber: 9,
  severityText: "INFO",
  body: "request completed",
  eventName: null,
  attributes: {},
  droppedAttributesCount: "0",
  resource: resource(serviceName),
  scope,
  serviceName,
});

const span = (serviceName: string, offsetMillis: number) => ({
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
  spanId: "00f067aa0ba902b7",
  parentSpanId: null,
  traceState: "",
  flags: 0,
  name: "GET /health",
  kind: "server" as const,
  startTimeUnixNano: unixNano(offsetMillis),
  endTimeUnixNano: unixNano(offsetMillis + 10),
  durationNanos: "10000000",
  status: { code: "ok" as const, message: "" },
  attributes: {},
  droppedAttributesCount: "0",
  events: [],
  droppedEventsCount: "0",
  links: [],
  droppedLinksCount: "0",
  resource: resource(serviceName),
  scope,
  serviceName,
});

const batch = (
  id: string,
  receivedAt: string,
  signals: {
    readonly metrics?: ReadonlyArray<ReturnType<typeof metric>>;
    readonly logs?: ReadonlyArray<ReturnType<typeof log>>;
    readonly spans?: ReadonlyArray<ReturnType<typeof span>>;
  },
) =>
  Schema.decodeUnknownSync(CanonicalTelemetryBatch)({
    id,
    receivedAt,
    metrics: signals.metrics ?? [],
    logs: signals.logs ?? [],
    spans: signals.spans ?? [],
  });

describe("in-memory telemetry summaries", () => {
  it("aggregates retained signals and services without crossing project boundaries", async () => {
    const firstReceivedAt = "2027-01-15T08:01:00.000Z";
    const lastReceivedAt = "2027-01-15T08:02:00.000Z";
    const first = batch("550e8400-e29b-41d4-a716-446655440000", firstReceivedAt, {
      metrics: [metric("checkout-api", 1_000)],
      logs: [log("worker", 2_000)],
      spans: [span("checkout-api", 3_000)],
    });
    const second = batch("550e8400-e29b-41d4-a716-446655440001", lastReceivedAt, {
      metrics: [metric("worker", 500)],
      logs: [log("checkout-api", 4_000)],
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const state = yield* Ref.make(emptyTelemetryMemoryState());
        const repository = makeInMemoryTelemetryRepository(state);
        yield* repository.ingest(projectId, 7, first);
        yield* repository.ingest(projectId, 7, first);
        yield* repository.ingest(projectId, 7, second);
        yield* repository.ingest(otherProjectId, 7, second);

        const services = yield* repository.listServices(projectId);
        expect(services.map(({ name }) => String(name))).toEqual(["checkout-api", "worker"]);
        expect(services[0]?.signals).toMatchObject({ metrics: true, logs: true, traces: true });
        expect(services[1]?.signals).toMatchObject({ metrics: true, logs: true, traces: false });
        expect(DateTime.toEpochMillis(services[0]!.firstSeenAt)).toBe(baseMillis + 1_000);
        expect(DateTime.toEpochMillis(services[0]!.lastSeenAt)).toBe(baseMillis + 4_000);
        expect(DateTime.toEpochMillis(services[1]!.firstSeenAt)).toBe(baseMillis + 500);
        expect(DateTime.toEpochMillis(services[1]!.lastSeenAt)).toBe(baseMillis + 2_000);

        const activity = yield* repository.listSignalActivity(projectId);
        expect(activity.map(({ signal, itemCount }) => [signal, itemCount])).toEqual([
          ["metrics", 2],
          ["logs", 2],
          ["traces", 1],
        ]);
        expect(activity[0]?.services.map(String)).toEqual(["checkout-api", "worker"]);
        expect(DateTime.toEpochMillis(activity[0]!.observedAt)).toBe(Date.parse(lastReceivedAt));
        expect(DateTime.toEpochMillis(activity[2]!.observedAt)).toBe(Date.parse(firstReceivedAt));

        const otherServices = yield* repository.listServices(otherProjectId);
        expect(otherServices.map(({ name }) => String(name))).toEqual(["checkout-api", "worker"]);
        expect(otherServices[0]?.signals).toMatchObject({
          metrics: false,
          logs: true,
          traces: false,
        });
        expect(otherServices[1]?.signals).toMatchObject({
          metrics: true,
          logs: false,
          traces: false,
        });
      }),
    );
  });

  it("uses strict signal-specific cursors", async () => {
    const traceCursor = Buffer.from(
      JSON.stringify({
        _tag: "traces",
        startTimeUnixNano: unixNano(1_000),
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      }),
    ).toString("base64url");

    await Effect.runPromise(
      Effect.gen(function* () {
        const state = yield* Ref.make(emptyTelemetryMemoryState());
        const repository = makeInMemoryTelemetryRepository(state);
        const search = Schema.decodeUnknownSync(LogSearch)({ cursor: traceCursor, limit: 10 });
        const error = yield* Effect.flip(repository.searchLogs(projectId, search));
        expect(error._tag).toBe("InvalidCursor");
      }),
    );
  });

  it("differences cumulative counters and handles resets", async () => {
    const tenSeconds = 10_000_000_000n; // 10 seconds
    const baseNano = BigInt(baseMillis) * 1_000_000n;
    const cumulativeStart = baseNano - 60_000_000_000n; // 1 minute
    const resetAt = baseNano + 2n * tenSeconds;
    const sumPoint = (value: number, time: bigint, start: bigint) => ({
      ...metric("counter-service", Number((time - baseNano) / 1_000_000n)),
      _tag: "sum" as const,
      name: "requests.cumulative",
      startTimeUnixNano: start.toString(),
      timeUnixNano: time.toString(),
      value: { _tag: "int" as const, value: String(value) },
      temporality: "cumulative" as const,
      monotonic: true,
    });
    const counterBatch = Schema.decodeUnknownSync(CanonicalTelemetryBatch)({
      id: "550e8400-e29b-41d4-a716-446655440010",
      receivedAt: "2027-01-15T08:01:00.000Z",
      metrics: [
        sumPoint(100, baseNano, cumulativeStart),
        sumPoint(110, baseNano + tenSeconds, cumulativeStart),
        sumPoint(5, resetAt, resetAt),
        sumPoint(15, baseNano + 3n * tenSeconds, resetAt),
      ],
      logs: [],
      spans: [],
    });
    const query = Schema.decodeUnknownSync(MetricQuery)({
      metric: "requests.cumulative",
      aggregation: "rate",
      range: {
        _tag: "absolute",
        start: new Date(baseMillis - 1_000).toISOString(),
        end: new Date(baseMillis + 31_000).toISOString(),
      },
      step: "10s",
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const state = yield* Ref.make(emptyTelemetryMemoryState());
        const repository = makeInMemoryTelemetryRepository(state);
        yield* repository.ingest(projectId, 7, counterBatch);
        const result = yield* repository.queryMetrics(projectId, query);
        expect(result.series[0]?.points.map(({ value }) => value)).toEqual([1, 0.5, 1]);
      }),
    );
  });
});
