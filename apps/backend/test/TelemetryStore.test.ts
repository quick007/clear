import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { OtlpLogsRequest, OtlpMetricsRequest, OtlpTracesRequest } from "@groundtruth/api-contract";
import { InvalidCursor, ProjectId } from "@groundtruth/domain";
import {
  AttributeKey,
  CanonicalTelemetryBatch,
  LogSearch,
  MetricName,
  MetricQuery,
  TelemetryInteger,
  TraceId,
  TraceSearch,
} from "@groundtruth/telemetry";
import { Cause, DateTime, Effect, Exit, Layer, Schema } from "effect";
import { CollectorIngestService } from "../src/telemetry/CollectorIngestService.js";
import { InvalidOtlpPayload } from "../src/telemetry/InvalidOtlpPayload.js";
import { TelemetryStore } from "../src/telemetry/TelemetryStore.js";
import { CollectorQuotaUnlimited, testWireBytes } from "./CollectorQuotaTestLayer.js";

const projectId = ProjectId.make("0198ec10-1a76-7000-8000-000000000001");
const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
const spanId = "00f067aa0ba902b7";
const start = "1787884800000000000";
const end = "1787884800150000000";

const resource = {
  attributes: [
    { key: "service.name", value: { stringValue: "checkout-api" } },
    { key: "deployment.environment", value: { stringValue: "test" } },
  ],
};

const IngestTest = CollectorIngestService.layer.pipe(
  Layer.provideMerge([TelemetryStore.layerMemory, CollectorQuotaUnlimited, NodeCrypto.layer]),
);

const metrics = new OtlpMetricsRequest({
  resourceMetrics: [
    {
      resource,
      scopeMetrics: [
        {
          scope: { name: "groundtruth.test", version: "1.0.0" },
          metrics: [
            {
              name: "http.server.requests",
              description: "Completed requests",
              unit: "{request}",
              gauge: {
                dataPoints: ["alice", "alice", "bob"].map((user, index) => ({
                  timeUnixNano: String(BigInt(start) + BigInt(index) * 10_000_000n),
                  asInt: "1",
                  attributes: [
                    { key: "user.id", value: { stringValue: user } },
                    { key: "http.response.status_code", value: { intValue: 200 } },
                    {
                      key: "request.context",
                      value: {
                        kvlistValue: {
                          values: [{ key: "attempt", value: { intValue: "9007199254740993" } }],
                        },
                      },
                    },
                  ],
                })),
              },
            },
          ],
        },
      ],
    },
  ],
});

const logs = new OtlpLogsRequest({
  resourceLogs: [
    {
      resource,
      scopeLogs: [
        {
          scope: { name: "groundtruth.test" },
          logRecords: [
            {
              timeUnixNano: end,
              observedTimeUnixNano: end,
              severityNumber: 17,
              severityText: "ERROR",
              traceId,
              spanId,
              body: { intValue: "9007199254740993" },
              attributes: [{ key: "payload", value: { bytesValue: "AQID" } }],
            },
          ],
        },
      ],
    },
  ],
});

const traces = new OtlpTracesRequest({
  resourceSpans: [
    {
      resource,
      scopeSpans: [
        {
          scope: { name: "groundtruth.test" },
          spans: [
            {
              traceId,
              spanId,
              name: "POST /checkout",
              kind: 2,
              startTimeUnixNano: start,
              endTimeUnixNano: end,
              status: { code: 2, message: "upstream unavailable" },
              attributes: [{ key: "http.response.status_code", value: { intValue: 503 } }],
            },
          ],
        },
      ],
    },
  ],
});

describe("telemetry ingestion and memory store", () => {
  it.effect("normalizes OTLP without flattening attributes and serves all query surfaces", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      const store = yield* TelemetryStore;
      const metricBatch = yield* ingest.enqueueMetrics(projectId, metrics, testWireBytes);
      const retriedMetricBatch = yield* ingest.enqueueMetrics(projectId, metrics, testWireBytes);
      assert.strictEqual(retriedMetricBatch.id, metricBatch.id);
      const logBatch = yield* ingest.enqueueLogs(projectId, logs, testWireBytes);
      assert.notStrictEqual(logBatch.id, metricBatch.id);
      assert.strictEqual(logBatch.logs.length, 1);
      const traceBatch = yield* ingest.enqueueTraces(projectId, traces, testWireBytes);
      yield* Effect.forEach(
        [metricBatch, logBatch, traceBatch],
        (batch) => Schema.encodeEffect(CanonicalTelemetryBatch)(batch),
        { discard: true },
      );

      const catalog = yield* store.listMetrics(projectId);
      assert.strictEqual(catalog.length, 1);
      assert.strictEqual(catalog[0]?.name, "http.server.requests");

      const query = new MetricQuery({
        metric: MetricName.make("http.server.requests"),
        aggregation: "count-distinct",
        distinctKey: AttributeKey.make("user.id"),
        range: {
          _tag: "absolute",
          start: DateTime.fromDateUnsafe(new Date("2026-08-28T02:00:00.000Z")),
          end: DateTime.fromDateUnsafe(new Date("2026-08-28T03:00:00.000Z")),
        },
        step: "1m",
        filters: [
          {
            key: AttributeKey.make("http.response.status_code"),
            operator: "equals",
            value: 200,
          },
        ],
      });
      const result = yield* store.queryMetrics(projectId, query);
      assert.strictEqual(result.series[0]?.points[0]?.value, 2);

      const filterParity = yield* store.queryMetrics(
        projectId,
        new MetricQuery({
          metric: MetricName.make("http.server.requests"),
          aggregation: "count",
          range: query.range,
          step: "1m",
          filters: [
            {
              key: AttributeKey.make("deployment.environment"),
              operator: "contains",
              value: "TEST",
            },
            {
              key: AttributeKey.make("cloud.region"),
              operator: "not-equals",
              value: "us-east-1",
            },
          ],
        }),
      );
      assert.strictEqual(filterParity.series[0]?.points[0]?.value, 3);

      const logPage = yield* store.searchLogs(projectId, {
        limit: 10,
        range: query.range,
      });
      assert.strictEqual(logPage.records.length, 1);
      assert(logPage.records[0]?.body instanceof TelemetryInteger);
      assert.strictEqual(logPage.records[0].body.value, 9_007_199_254_740_993n);

      const trace = yield* store.getTrace(projectId, TraceId.make(traceId));
      assert.strictEqual(trace.summary.rootSpanName, "POST /checkout");
      assert.strictEqual(trace.correlatedLogs.length, 1);

      const services = yield* store.listServices(projectId);
      assert.strictEqual(services[0]?.signals.metrics, true);
      assert.strictEqual(services[0]?.signals.logs, true);
      assert.strictEqual(services[0]?.signals.traces, true);
      const health = yield* store.signalHealth(projectId);
      assert.strictEqual(health.length, 3);
      assert(health.every((signal) => signal.status === "healthy"));
    }).pipe(Effect.provide(IngestTest)),
  );

  it.effect("rejects spans that cannot be represented canonically", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      const invalid = new OtlpTracesRequest({
        resourceSpans: [
          {
            resource,
            scopeSpans: [{ spans: [{ traceId, spanId: "", name: "broken" }] }],
          },
        ],
      });
      const exit = yield* Effect.exit(ingest.enqueueTraces(projectId, invalid, testWireBytes));
      assert(Exit.isFailure(exit));
      assert(
        exit.cause.reasons.some(
          (reason) => Cause.isFailReason(reason) && reason.error instanceof InvalidOtlpPayload,
        ),
      );
    }).pipe(Effect.provide(IngestTest)),
  );

  it.effect("keeps log and trace pages stable when newer telemetry arrives", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      const store = yield* TelemetryStore;
      const oneSecondInNanos = 1_000_000_000n; // 1 second
      const at = (offset: number) => String(BigInt(start) + BigInt(offset) * oneSecondInNanos);
      const range = {
        _tag: "absolute" as const,
        start: DateTime.fromDateUnsafe(new Date("2026-08-28T02:39:50.000Z")),
        end: DateTime.fromDateUnsafe(new Date("2026-08-28T02:40:10.000Z")),
      };
      const logRequest = (...offsets: ReadonlyArray<number>) =>
        new OtlpLogsRequest({
          resourceLogs: [
            {
              resource,
              scopeLogs: [
                {
                  logRecords: offsets.map((offset) => ({
                    timeUnixNano: at(offset),
                    observedTimeUnixNano: at(offset),
                    severityNumber: 9 as const,
                    body: { stringValue: `log-${offset}` },
                  })),
                },
              ],
            },
          ],
        });
      const traceRequest = (...offsets: ReadonlyArray<number>) =>
        new OtlpTracesRequest({
          resourceSpans: [
            {
              resource,
              scopeSpans: [
                {
                  spans: offsets.map((offset) => ({
                    traceId: String(offset).padStart(32, "0"),
                    spanId: String(offset).padStart(16, "0"),
                    name: `trace-${offset}`,
                    kind: 2 as const,
                    startTimeUnixNano: at(offset),
                    endTimeUnixNano: String(BigInt(at(offset)) + 100_000_000n), // 100 milliseconds
                  })),
                },
              ],
            },
          ],
        });

      yield* ingest.enqueueLogs(projectId, logRequest(1, 2, 3), testWireBytes);
      const firstLogs = yield* store.searchLogs(projectId, new LogSearch({ range, limit: 2 }));
      assert.deepStrictEqual(
        firstLogs.records.map((record) => record.body),
        ["log-3", "log-2"],
      );
      assert(firstLogs.nextCursor !== null);
      yield* ingest.enqueueLogs(projectId, logRequest(4), testWireBytes);
      const secondLogs = yield* store.searchLogs(
        projectId,
        new LogSearch({ range, limit: 2, cursor: firstLogs.nextCursor }),
      );
      assert.deepStrictEqual(
        secondLogs.records.map((record) => record.body),
        ["log-1"],
      );

      yield* ingest.enqueueTraces(projectId, traceRequest(1, 2, 3), testWireBytes);
      const firstTraces = yield* store.searchTraces(
        projectId,
        new TraceSearch({ range, limit: 2 }),
      );
      assert.deepStrictEqual(
        firstTraces.traces.map((trace) => trace.rootSpanName),
        ["trace-3", "trace-2"],
      );
      assert(firstTraces.nextCursor !== null);
      const mismatchedCursor = yield* Effect.flip(
        store.searchTraces(
          projectId,
          new TraceSearch({ range, limit: 2, cursor: firstLogs.nextCursor }),
        ),
      );
      assert(mismatchedCursor instanceof InvalidCursor);
      yield* ingest.enqueueTraces(projectId, traceRequest(4), testWireBytes);
      const secondTraces = yield* store.searchTraces(
        projectId,
        new TraceSearch({ range, limit: 2, cursor: firstTraces.nextCursor }),
      );
      assert.deepStrictEqual(
        secondTraces.traces.map((trace) => trace.rootSpanName),
        ["trace-1"],
      );
    }).pipe(Effect.provide(IngestTest)),
  );

  it.effect("derives cumulative monotonic rates and handles counter resets", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      const store = yield* TelemetryStore;
      const tenSecondsInNanos = 10_000_000_000n; // 10 seconds
      const initialStart = BigInt(start) - 60_000_000_000n; // 1 minute before the first point
      const resetAt = BigInt(start) + 2n * tenSecondsInNanos;
      const cumulative = new OtlpMetricsRequest({
        resourceMetrics: [
          {
            resource,
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: "checkout.requests.cumulative",
                    sum: {
                      aggregationTemporality: 2,
                      isMonotonic: true,
                      dataPoints: [
                        {
                          startTimeUnixNano: String(initialStart),
                          timeUnixNano: start,
                          asInt: 100,
                        },
                        {
                          startTimeUnixNano: String(initialStart),
                          timeUnixNano: String(BigInt(start) + tenSecondsInNanos),
                          asInt: 110,
                        },
                        {
                          startTimeUnixNano: String(resetAt),
                          timeUnixNano: String(resetAt),
                          asInt: 5,
                        },
                        {
                          startTimeUnixNano: String(resetAt),
                          timeUnixNano: String(BigInt(start) + 3n * tenSecondsInNanos),
                          asInt: 15,
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      });
      yield* ingest.enqueueMetrics(projectId, cumulative, testWireBytes);

      const result = yield* store.queryMetrics(
        projectId,
        new MetricQuery({
          metric: MetricName.make("checkout.requests.cumulative"),
          aggregation: "rate",
          range: {
            _tag: "absolute",
            start: DateTime.fromDateUnsafe(new Date("2026-08-28T02:39:50.000Z")),
            end: DateTime.fromDateUnsafe(new Date("2026-08-28T02:40:40.000Z")),
          },
          step: "10s",
        }),
      );
      assert.deepStrictEqual(
        result.series[0]?.points.map((point) => point.value),
        [1, 0.5, 1],
      );
    }).pipe(Effect.provide(IngestTest)),
  );

  it.effect("rejects values outside canonical int64 bounds before storing them", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      const store = yield* TelemetryStore;
      const invalid = new OtlpMetricsRequest({
        resourceMetrics: [
          {
            resource,
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: "requests.invalid",
                    gauge: {
                      dataPoints: [
                        {
                          timeUnixNano: start,
                          asInt: "9223372036854775808",
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      });
      const exit = yield* Effect.exit(ingest.enqueueMetrics(projectId, invalid, testWireBytes));
      assert(Exit.isFailure(exit));
      assert(
        exit.cause.reasons.some(
          (reason) => Cause.isFailReason(reason) && reason.error instanceof InvalidOtlpPayload,
        ),
      );
      assert.strictEqual((yield* store.listMetrics(projectId)).length, 0);

      const valid = yield* ingest.enqueueMetrics(projectId, metrics, testWireBytes);
      assert.strictEqual(valid.metrics.length, 3);
      assert.strictEqual((yield* store.listMetrics(projectId)).length, 1);
    }).pipe(Effect.provide(IngestTest)),
  );
});
