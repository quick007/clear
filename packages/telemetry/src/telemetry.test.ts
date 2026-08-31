import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Result, Schema } from "effect";
import {
  AbsoluteTimeRange,
  aggregateMetricPoints,
  AttributeFilter,
  CanonicalTelemetryBatch,
  MetricAggregateQuery,
  MetricQuery,
  maximumMetricQuerySeconds,
  metricQueryDurationSeconds,
  metricQuerySupportsRollups,
  metricQueryUsesRollups,
  TelemetryBytes,
  TelemetryInteger,
  TelemetryValue,
  TraceDetail,
  TraceId,
  TraceSearch,
} from "./index.ts";

const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
const spanId = "00f067aa0ba902b7";
const now = "1724745600000000000";
const later = "1724745600150000000";

const resource = {
  attributes: { "service.name": "checkout-api" },
  droppedAttributesCount: "0",
  entityRefs: [],
  schemaUrl: null,
};

const scope = {
  name: "groundtruth.test",
  version: "1.0.0",
  attributes: {},
  droppedAttributesCount: "0",
  schemaUrl: null,
};

const span = {
  traceId,
  spanId,
  parentSpanId: null,
  traceState: "",
  flags: 1,
  name: "POST /checkout",
  kind: "server",
  startTimeUnixNano: now,
  endTimeUnixNano: later,
  durationNanos: "150000000",
  status: { code: "error", message: "upstream unavailable" },
  attributes: { "http.response.status_code": 503 },
  droppedAttributesCount: "0",
  events: [],
  droppedEventsCount: "0",
  links: [],
  droppedLinksCount: "0",
  resource,
  scope,
  serviceName: "checkout-api",
};

const metricBase = {
  description: "Request duration",
  unit: "ms",
  metadata: {},
  resource,
  scope,
  serviceName: "checkout-api",
  startTimeUnixNano: now,
  timeUnixNano: later,
  attributes: { route: "/checkout" },
  exemplars: [],
  flags: 0,
};

describe("telemetry schemas", () => {
  it.effect("rejects inverted absolute ranges and trace duration bounds", () =>
    Effect.gen(function* () {
      const invertedRange = yield* Schema.decodeUnknownEffect(AbsoluteTimeRange)({
        _tag: "absolute",
        start: "2026-08-28T10:00:00.000Z",
        end: "2026-08-28T09:00:00.000Z",
      }).pipe(Effect.exit);
      assert(Exit.isFailure(invertedRange));

      const invertedDuration = yield* Schema.decodeUnknownEffect(TraceSearch)({
        minimumDurationMs: 500,
        maximumDurationMs: 100,
      }).pipe(Effect.exit);
      assert(Exit.isFailure(invertedDuration));
    }),
  );
  it.effect("validates trace and span identifiers", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* Schema.decodeUnknownEffect(TraceId)(traceId), traceId);
      const invalid = yield* Schema.decodeUnknownEffect(TraceId)(
        "00000000000000000000000000000000",
      ).pipe(Effect.exit);
      assert(Exit.isFailure(invalid));
    }),
  );

  it.effect("decodes bounded metric queries", () =>
    Effect.gen(function* () {
      const query = yield* Schema.decodeUnknownEffect(MetricQuery)({
        metric: "http.server.requests",
        aggregation: "rate",
        range: { _tag: "relative", window: "15m" },
        step: "10s",
        filters: [{ key: "service.name", operator: "equals", value: "checkout-api" }],
        groupBy: ["retry"],
        maxSeries: 8,
        maxPoints: 900,
      });
      assert.strictEqual(query.aggregation, "rate");
      assert.strictEqual(query.groupBy?.length, 1);
    }),
  );

  it.effect("routes supported seven day metric queries through rollups", () =>
    Effect.gen(function* () {
      const supported = yield* Schema.decodeUnknownEffect(MetricQuery)({
        metric: "http.server.duration",
        aggregation: "p95",
        range: { _tag: "relative", window: "7d" },
        filters: [{ key: "service.name", operator: "equals", value: "checkout-api" }],
        groupBy: ["service.name"],
      });
      const unsupported = yield* Schema.decodeUnknownEffect(MetricQuery)({
        metric: "http.server.requests",
        aggregation: "rate",
        range: { _tag: "relative", window: "7d" },
        groupBy: ["retry"],
      });

      assert.strictEqual(metricQueryDurationSeconds(supported), maximumMetricQuerySeconds);
      assert(metricQueryUsesRollups(supported));
      assert(metricQuerySupportsRollups(supported));
      assert(!metricQuerySupportsRollups(unsupported));
    }),
  );

  it.effect("requires a distinct attribute exactly for count-distinct", () =>
    Effect.gen(function* () {
      const query = yield* Schema.decodeUnknownEffect(MetricQuery)({
        metric: "http.server.requests",
        aggregation: "count-distinct",
        distinctKey: "user.id",
        range: { _tag: "relative", window: "15m" },
      });
      assert.strictEqual(query.distinctKey, "user.id");

      const missing = yield* Schema.decodeUnknownEffect(MetricQuery)({
        metric: "http.server.requests",
        aggregation: "count-distinct",
        range: { _tag: "relative", window: "15m" },
      }).pipe(Effect.exit);
      assert(Exit.isFailure(missing));

      const misplaced = yield* Schema.decodeUnknownEffect(MetricQuery)({
        metric: "http.server.requests",
        aggregation: "rate",
        distinctKey: "user.id",
        range: { _tag: "relative", window: "15m" },
      }).pipe(Effect.exit);
      assert(Exit.isFailure(misplaced));
    }),
  );

  it.effect("keeps aggregate queries unbucketed and validates distinct attributes", () =>
    Effect.gen(function* () {
      const query = yield* Schema.decodeUnknownEffect(MetricAggregateQuery)({
        metric: "http.server.requests",
        aggregation: "count-distinct",
        distinctKey: "user.id",
        range: { _tag: "relative", window: "15m" },
      });
      assert.strictEqual(query.distinctKey, "user.id");
      assert(!("step" in query));

      const missing = yield* Schema.decodeUnknownEffect(MetricAggregateQuery)({
        metric: "http.server.requests",
        aggregation: "count-distinct",
        range: { _tag: "relative", window: "15m" },
      }).pipe(Effect.exit);
      assert(Exit.isFailure(missing));
    }),
  );

  it("aggregates a complete counter window and excludes missing distinct attributes", () => {
    const baseMillis = Date.parse("2027-01-15T08:00:00.000Z");
    const baseNano = BigInt(baseMillis) * 1_000_000n;
    const tenSeconds = 10_000_000_000n; // 10 seconds
    const counterStart = baseNano - 60_000_000_000n; // 1 minute
    const resetAt = baseNano + 2n * tenSeconds;
    const point = (value: number, timeUnixNano: bigint, startTimeUnixNano: bigint) => ({
      ...metricBase,
      _tag: "sum" as const,
      name: "requests.cumulative",
      attributes: { route: "/checkout" },
      startTimeUnixNano: String(startTimeUnixNano),
      timeUnixNano: String(timeUnixNano),
      value: { _tag: "int" as const, value: String(value) },
      temporality: "cumulative" as const,
      monotonic: true,
    });
    const batch = Schema.decodeUnknownSync(CanonicalTelemetryBatch)({
      id: "550e8400-e29b-41d4-a716-446655440010",
      receivedAt: "2027-01-15T08:01:00.000Z",
      metrics: [
        point(100, baseNano, counterStart),
        point(110, baseNano + tenSeconds, counterStart),
        point(5, resetAt, resetAt),
        point(15, baseNano + 3n * tenSeconds, resetAt),
        {
          ...metricBase,
          _tag: "gauge",
          name: "users.active",
          attributes: {},
          timeUnixNano: String(baseNano + tenSeconds),
          value: { _tag: "int", value: "1" },
        },
        {
          ...metricBase,
          _tag: "gauge",
          name: "users.active",
          attributes: { user: "ada" },
          timeUnixNano: String(baseNano + 2n * tenSeconds),
          value: { _tag: "int", value: "1" },
        },
      ],
      logs: [],
      spans: [],
    });
    const range = {
      _tag: "absolute",
      start: new Date(baseMillis + 5_000).toISOString(),
      end: new Date(baseMillis + 31_000).toISOString(),
    };
    const rateQuery = Schema.decodeUnknownSync(MetricAggregateQuery)({
      metric: "requests.cumulative",
      aggregation: "rate",
      range,
    });
    const rate = aggregateMetricPoints(batch.metrics, rateQuery, baseMillis + 31_000);
    assert(Result.isSuccess(rate));
    assert.strictEqual(rate.success.matchedPoints, 3);
    assert.closeTo(rate.success.value!, 25 / 26, 0.000_000_01);

    const distinctQuery = Schema.decodeUnknownSync(MetricAggregateQuery)({
      metric: "users.active",
      aggregation: "count-distinct",
      distinctKey: "user",
      range,
    });
    const distinct = aggregateMetricPoints(batch.metrics, distinctQuery, baseMillis + 31_000);
    assert(Result.isSuccess(distinct));
    assert.strictEqual(distinct.success.value, 1);
  });

  it.effect("keeps attribute filter operators and values coherent", () =>
    Effect.gen(function* () {
      const exists = yield* Schema.decodeUnknownEffect(AttributeFilter)({
        key: "retry",
        operator: "exists",
        value: null,
      });
      assert.strictEqual(exists.value, null);

      const ignoredExistsValue = yield* Schema.decodeUnknownEffect(AttributeFilter)({
        key: "retry",
        operator: "exists",
        value: true,
      }).pipe(Effect.exit);
      assert(Exit.isFailure(ignoredExistsValue));

      const missingMatchValue = yield* Schema.decodeUnknownEffect(AttributeFilter)({
        key: "retry",
        operator: "equals",
        value: null,
      }).pipe(Effect.exit);
      assert(Exit.isFailure(missingMatchValue));
    }),
  );

  it.effect("preserves structured log values", () =>
    Effect.gen(function* () {
      const body = yield* Schema.decodeUnknownEffect(TelemetryValue)({
        message: "payment failed",
        attempts: [1, 2, 3],
        retryable: true,
      });
      assert.deepStrictEqual(body, {
        message: "payment failed",
        attempts: [1, 2, 3],
        retryable: true,
      });

      const bytes = yield* Schema.decodeUnknownEffect(TelemetryBytes)({
        _tag: "bytes",
        value: "AQID",
      });
      assert.deepStrictEqual([...bytes.value], [1, 2, 3]);

      const integer = yield* Schema.decodeUnknownEffect(TelemetryInteger)({
        _tag: "int",
        value: "9007199254740993",
      });
      assert.strictEqual(integer.value, 9_007_199_254_740_993n);
    }),
  );

  it.effect("decodes canonical batches without flattening OTLP semantics", () =>
    Effect.gen(function* () {
      const batch = yield* Schema.decodeUnknownEffect(CanonicalTelemetryBatch)({
        id: "550e8400-e29b-41d4-a716-446655440000",
        receivedAt: "2026-08-27T08:00:00.000Z",
        metrics: [
          {
            _tag: "histogram",
            ...metricBase,
            name: "http.server.duration",
            exemplars: [
              {
                timeUnixNano: later,
                value: { _tag: "double", value: 150 },
                filteredAttributes: {},
                traceId,
                spanId,
              },
            ],
            temporality: "delta",
            count: "3",
            sum: 450,
            minimum: 120,
            maximum: 180,
            explicitBounds: [100, 200],
            bucketCounts: ["0", "3", "0"],
          },
          {
            _tag: "gauge",
            ...metricBase,
            name: "requests.total",
            value: { _tag: "int", value: "9007199254740993" },
          },
        ],
        logs: [],
        spans: [span],
      });
      assert.strictEqual(batch.metrics[0]?._tag, "histogram");
      assert.strictEqual(batch.spans[0]?.durationNanos, 150000000n);
      const gauge = batch.metrics[1];
      assert(gauge?._tag === "gauge");
      assert(gauge.value._tag === "int");
      assert.strictEqual(gauge.value.value, 9007199254740993n);
    }),
  );

  it.effect("decodes trace trees and correlated logs", () =>
    Effect.gen(function* () {
      const detail = yield* Schema.decodeUnknownEffect(TraceDetail)({
        summary: {
          traceId,
          rootSpanName: "POST /checkout",
          rootServiceName: "checkout-api",
          startTimeUnixNano: now,
          durationMs: 150,
          status: "error",
          spanCount: 1,
          errorSpanCount: 1,
          services: ["checkout-api"],
        },
        roots: [{ span, children: [] }],
        spans: [span],
        correlatedLogs: [],
        serviceEdges: [],
        complete: true,
        hint: "Inspect retry attributes next",
      });
      assert.strictEqual(detail.roots[0]?.span.traceId, traceId);
    }),
  );
});
