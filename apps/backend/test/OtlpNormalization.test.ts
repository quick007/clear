import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import { OtlpLogsRequest, OtlpMetricsRequest, OtlpTracesRequest } from "@groundtruth/api-contract";
import { ProjectId } from "@groundtruth/domain";
import { TelemetryUnavailable } from "@groundtruth/telemetry";
import { Cause, Crypto, Effect, Exit, Layer, PlatformError } from "effect";
import { CollectorIngestService } from "../src/telemetry/CollectorIngestService.js";
import { InvalidOtlpPayload } from "../src/telemetry/InvalidOtlpPayload.js";
import { signedInt64, unsignedInt64 } from "../src/telemetry/OtlpNumber.js";
import { TelemetryStore } from "../src/telemetry/TelemetryStore.js";
import { CollectorQuotaUnlimited, testWireBytes } from "./CollectorQuotaTestLayer.js";

const projectId = ProjectId.make("0198ec10-1a76-7000-8000-000000000011");
const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
const spanId = "00f067aa0ba902b7";
const start = "1787884800000000000";
const end = "1787884800150000000";
const resource = {
  attributes: [{ key: "service.name", value: { stringValue: "checkout-api" } }],
};
const IngestTest = CollectorIngestService.layer.pipe(
  Layer.provideMerge([TelemetryStore.layerMemory, CollectorQuotaUnlimited, NodeCrypto.layer]),
);
const deterministicCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (_algorithm, data) => Effect.succeed(data),
});
const ingestTestWithDigest = (digest: Crypto.Crypto["digest"]) =>
  CollectorIngestService.layer.pipe(
    Layer.provideMerge([
      TelemetryStore.layerMemory,
      CollectorQuotaUnlimited,
      Layer.succeed(Crypto.Crypto, Crypto.Crypto.of({ ...deterministicCrypto, digest })),
    ]),
  );
const ingestTestWithStoreIngest = (ingestBatch: TelemetryStore["Service"]["ingest"]) => {
  const StoreTest = Layer.effect(
    TelemetryStore,
    TelemetryStore.pipe(
      Effect.map((store) => TelemetryStore.of({ ...store, ingest: ingestBatch })),
    ),
  ).pipe(Layer.provide(TelemetryStore.layerMemory));
  return CollectorIngestService.layer.pipe(
    Layer.provideMerge([StoreTest, CollectorQuotaUnlimited, NodeCrypto.layer]),
  );
};
type ResourceMetrics = NonNullable<OtlpMetricsRequest["resourceMetrics"]>[number];
type ScopeMetrics = NonNullable<ResourceMetrics["scopeMetrics"]>[number];
type OtlpMetric = NonNullable<ScopeMetrics["metrics"]>[number];
const metricRequest = (...metrics: ReadonlyArray<OtlpMetric>) =>
  new OtlpMetricsRequest({ resourceMetrics: [{ resource, scopeMetrics: [{ metrics }] }] });

describe("OTLP normalization validation", () => {
  it.effect("derives stable content-scoped batch identities for retry deduplication", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      const request = metricRequest({
        name: "stable.batch",
        gauge: { dataPoints: [{ timeUnixNano: start, asInt: "1" }] },
      });
      const first = yield* ingest.enqueueMetrics(projectId, request, testWireBytes);
      const retry = yield* ingest.enqueueMetrics(projectId, request, testWireBytes);
      const changed = yield* ingest.enqueueMetrics(
        projectId,
        metricRequest({
          name: "distinct.batch",
          gauge: { dataPoints: [{ timeUnixNano: start, asInt: "1" }] },
        }),
        testWireBytes,
      );

      assert.strictEqual(retry.id, first.id);
      assert.notStrictEqual(changed.id, first.id);
    }).pipe(Effect.provide(IngestTest)),
  );

  it.effect("rejects unsafe numeric forms for signed and unsigned 64-bit fields", () =>
    Effect.gen(function* () {
      const signed = yield* Effect.flip(signedInt64(Number.MAX_SAFE_INTEGER + 1, "metric.asInt"));
      assert.strictEqual(signed.path, "metric.asInt");
      const unsigned = yield* Effect.flip(
        unsignedInt64(Number.MAX_SAFE_INTEGER + 1, "metric.timeUnixNano"),
      );
      assert.strictEqual(unsigned.path, "metric.timeUnixNano");
      const malformed = yield* Effect.flip(signedInt64("not-an-integer", "metric.asInt"));
      assert.strictEqual(malformed.path, "metric.asInt");
      assert.strictEqual(
        yield* signedInt64("9007199254740993", "metric.asInt"),
        9_007_199_254_740_993n,
      );
    }),
  );

  it.effect("rejects ambiguous metric unions and keeps the queue worker alive", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      const rejectMetric = Effect.fn("rejectMalformedMetric")(function* (
        metric: OtlpMetric,
        expectedPath: string,
      ) {
        const error = yield* Effect.flip(
          ingest.enqueueMetrics(projectId, metricRequest(metric), testWireBytes),
        );
        assert(error instanceof InvalidOtlpPayload);
        assert.strictEqual(error.path, expectedPath);
      });
      const metricPath = "resourceMetrics[0].scopeMetrics[0].metrics[0]";
      const pointPath = `${metricPath}.gauge.dataPoints[0]`;

      yield* rejectMetric(
        {
          name: "ambiguous.metric",
          gauge: { dataPoints: [] },
          sum: { dataPoints: [] },
        },
        metricPath,
      );
      yield* rejectMetric(
        {
          name: "ambiguous.number",
          gauge: { dataPoints: [{ timeUnixNano: start, asDouble: 1, asInt: "1" }] },
        },
        pointPath,
      );
      yield* rejectMetric(
        {
          name: "ambiguous.exemplar",
          gauge: {
            dataPoints: [
              {
                timeUnixNano: start,
                asInt: "1",
                exemplars: [{ timeUnixNano: start, asDouble: 1, asInt: "1" }],
              },
            ],
          },
        },
        `${pointPath}.exemplars[0]`,
      );
      yield* rejectMetric(
        {
          name: "invalid.flags",
          gauge: {
            dataPoints: [{ timeUnixNano: start, asInt: "1", flags: 4_294_967_296 }],
          },
        },
        `${pointPath}.flags`,
      );

      const accepted = yield* ingest.enqueueMetrics(
        projectId,
        metricRequest({
          name: "accepted.after.rejections",
          gauge: { dataPoints: [{ timeUnixNano: start, asInt: "1" }] },
        }),
        testWireBytes,
      );
      assert.strictEqual(accepted.metrics.length, 1);
    }).pipe(Effect.provide(IngestTest)),
  );

  it.effect("rejects invalid AnyValue unions and reversed spans", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      const rejectLog = Effect.fn("rejectMalformedLog")(function* (
        request: OtlpLogsRequest,
        expectedPath: string,
      ) {
        const error = yield* Effect.flip(ingest.enqueueLogs(projectId, request, testWireBytes));
        assert(error instanceof InvalidOtlpPayload);
        assert.strictEqual(error.path, expectedPath);
      });
      const recordPath = "resourceLogs[0].scopeLogs[0].logRecords[0]";

      yield* rejectLog(
        new OtlpLogsRequest({
          resourceLogs: [
            {
              resource,
              scopeLogs: [
                {
                  logRecords: [
                    {
                      timeUnixNano: start,
                      body: { stringValue: "conflict", boolValue: true },
                    },
                  ],
                },
              ],
            },
          ],
        }),
        `${recordPath}.body`,
      );
      yield* rejectLog(
        new OtlpLogsRequest({
          resourceLogs: [
            {
              resource,
              scopeLogs: [
                {
                  logRecords: [
                    {
                      timeUnixNano: start,
                      body: { arrayValue: { values: [{}] } },
                    },
                  ],
                },
              ],
            },
          ],
        }),
        `${recordPath}.body.arrayValue.values[0]`,
      );

      const traceError = yield* Effect.flip(
        ingest.enqueueTraces(
          projectId,
          new OtlpTracesRequest({
            resourceSpans: [
              {
                resource,
                scopeSpans: [
                  {
                    spans: [
                      {
                        traceId,
                        spanId,
                        name: "reversed",
                        startTimeUnixNano: end,
                        endTimeUnixNano: start,
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          testWireBytes,
        ),
      );
      assert(traceError instanceof InvalidOtlpPayload);
      assert.strictEqual(
        traceError.path,
        "resourceSpans[0].scopeSpans[0].spans[0].endTimeUnixNano",
      );
    }).pipe(Effect.provide(IngestTest)),
  );

  it.effect("preserves crypto failures, defects, and interruption causes", () =>
    Effect.gen(function* () {
      const request = metricRequest({
        name: "crypto.failure",
        gauge: { dataPoints: [{ timeUnixNano: start, asInt: "1" }] },
      });
      const platformFailure = PlatformError.badArgument({
        module: "Crypto",
        method: "digest",
        description: "test failure",
      });
      const unavailable = yield* Effect.flip(
        Effect.provide(
          CollectorIngestService.pipe(
            Effect.flatMap((ingest) => ingest.enqueueMetrics(projectId, request, testWireBytes)),
          ),
          ingestTestWithDigest(() => Effect.fail(platformFailure)),
        ),
      );
      assert(unavailable instanceof TelemetryUnavailable);
      assert.strictEqual(unavailable.operation, "create collector batch identity");

      const defectExit = yield* Effect.exit(
        Effect.provide(
          CollectorIngestService.pipe(
            Effect.flatMap((ingest) => ingest.enqueueMetrics(projectId, request, testWireBytes)),
          ),
          ingestTestWithDigest(() => Effect.die("crypto defect")),
        ),
      );
      assert(Exit.isFailure(defectExit));
      assert(Cause.hasDies(defectExit.cause));

      const interruptedExit = yield* Effect.exit(
        Effect.provide(
          CollectorIngestService.pipe(
            Effect.flatMap((ingest) => ingest.enqueueMetrics(projectId, request, testWireBytes)),
          ),
          ingestTestWithDigest(() => Effect.interrupt),
        ),
      );
      assert(Exit.isFailure(interruptedExit));
      assert(Cause.hasInterrupts(interruptedExit.cause));
    }),
  );

  it.effect("completes callers and re-propagates store defects and interruptions", () =>
    Effect.gen(function* () {
      const request = metricRequest({
        name: "store.failure",
        gauge: { dataPoints: [{ timeUnixNano: start, asInt: "1" }] },
      });
      const enqueue = CollectorIngestService.pipe(
        Effect.flatMap((ingest) => ingest.enqueueMetrics(projectId, request, testWireBytes)),
      );

      const defectExit = yield* Effect.exit(
        Effect.provide(
          enqueue,
          ingestTestWithStoreIngest(() => Effect.die("store defect")),
        ),
      );
      assert(Exit.isFailure(defectExit));
      assert(Cause.hasDies(defectExit.cause));

      const interruptedExit = yield* Effect.exit(
        Effect.provide(
          enqueue,
          ingestTestWithStoreIngest(() => Effect.interrupt),
        ),
      );
      assert(Exit.isFailure(interruptedExit));
      assert(Cause.hasInterrupts(interruptedExit.cause));
    }),
  );
});
