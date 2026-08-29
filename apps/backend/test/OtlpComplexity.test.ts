import { NodeCrypto } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  type OtlpAnyValue,
  OtlpAnyValueLimits,
  OtlpLogsRequest,
  OtlpMetricsRequest,
  OtlpStructuralLimits,
  OtlpTracesRequest,
} from "@groundtruth/api-contract";
import { ProjectId } from "@groundtruth/domain";
import { Crypto, Effect, Layer } from "effect";
import { CollectorIngestService } from "../src/telemetry/CollectorIngestService.js";
import { InvalidOtlpPayload } from "../src/telemetry/InvalidOtlpPayload.js";
import { TelemetryStore } from "../src/telemetry/TelemetryStore.js";
import { CollectorQuotaUnlimited, testWireBytes } from "./CollectorQuotaTestLayer.js";

const projectId = ProjectId.make("0198ec10-1a76-7000-8000-000000000012");
const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
const spanId = "00f067aa0ba902b7";
const time = "1787884800000000000";
const resource = {
  attributes: [{ key: "service.name", value: { stringValue: "checkout-api" } }],
};
const IngestTest = CollectorIngestService.layer.pipe(
  Layer.provideMerge([TelemetryStore.layerMemory, CollectorQuotaUnlimited, NodeCrypto.layer]),
);

type Signal = "metrics" | "logs" | "traces";
const signals: ReadonlyArray<Signal> = ["metrics", "logs", "traces"];

const enqueueEnvelopes = (
  ingest: CollectorIngestService["Service"],
  signal: Signal,
  count: number,
) => {
  if (signal === "metrics") {
    return ingest.enqueueMetrics(
      projectId,
      new OtlpMetricsRequest({ resourceMetrics: Array.from({ length: count }, () => ({})) }),
      testWireBytes,
    );
  }
  if (signal === "logs") {
    return ingest.enqueueLogs(
      projectId,
      new OtlpLogsRequest({ resourceLogs: Array.from({ length: count }, () => ({})) }),
      testWireBytes,
    );
  }
  return ingest.enqueueTraces(
    projectId,
    new OtlpTracesRequest({ resourceSpans: Array.from({ length: count }, () => ({})) }),
    testWireBytes,
  );
};

const enqueueValue = (
  ingest: CollectorIngestService["Service"],
  signal: Signal,
  value: OtlpAnyValue,
) => {
  if (signal === "metrics") {
    return ingest.enqueueMetrics(
      projectId,
      new OtlpMetricsRequest({
        resourceMetrics: [
          {
            resource,
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: "complexity.fixture",
                    gauge: {
                      dataPoints: [
                        { timeUnixNano: time, asInt: "1", attributes: [{ key: "value", value }] },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
      testWireBytes,
    );
  }
  if (signal === "logs") {
    return ingest.enqueueLogs(
      projectId,
      new OtlpLogsRequest({
        resourceLogs: [
          { resource, scopeLogs: [{ logRecords: [{ timeUnixNano: time, body: value }] }] },
        ],
      }),
      testWireBytes,
    );
  }
  return ingest.enqueueTraces(
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
                  name: "complexity fixture",
                  startTimeUnixNano: time,
                  endTimeUnixNano: time,
                  attributes: [{ key: "value", value }],
                },
              ],
            },
          ],
        },
      ],
    }),
    testWireBytes,
  );
};

const nestedValue = (depth: number) => {
  let value: OtlpAnyValue = { stringValue: "leaf" };
  for (let level = 1; level < depth; level += 1) {
    value = { arrayValue: { values: [value] } };
  }
  return value;
};

const excessiveNodeValue = (): OtlpAnyValue => ({
  arrayValue: {
    values: Array.from({ length: 10 }, () => ({
      arrayValue: {
        values: Array.from({ length: 1_000 }, () => ({ boolValue: true })),
      },
    })),
  },
});

const rejectAcrossSignals = (
  ingest: CollectorIngestService["Service"],
  value: OtlpAnyValue,
  expectedPathFragment: string,
) =>
  Effect.forEach(signals, (signal) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(enqueueValue(ingest, signal, value));
      assert(error instanceof InvalidOtlpPayload);
      assert(
        error.path.includes(expectedPathFragment),
        `${signal} returned unexpected path ${error.path}`,
      );
    }),
  );

describe("OTLP complexity limits", () => {
  it.effect("rejects high-cardinality signal envelopes before hashing", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      for (const signal of signals) {
        const error = yield* Effect.flip(
          enqueueEnvelopes(ingest, signal, OtlpStructuralLimits.maxContainerEntries + 1),
        );
        assert(error instanceof InvalidOtlpPayload);
        assert.strictEqual(
          error.path,
          signal === "metrics"
            ? "resourceMetrics"
            : signal === "logs"
              ? "resourceLogs"
              : "resourceSpans",
        );
      }
    }).pipe(Effect.provide(IngestTest)),
  );

  it.effect("rejects omitted-value attribute fan-out at the global node budget", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      const resourceMetrics = Array.from({ length: 100 }, (_, resourceIndex) => ({
        resource: {
          attributes: Array.from({ length: 600 }, (_, attributeIndex) => ({
            key: `attribute-${resourceIndex}-${attributeIndex}`,
          })),
        },
      }));
      const error = yield* Effect.flip(
        ingest.enqueueMetrics(
          projectId,
          new OtlpMetricsRequest({ resourceMetrics }),
          testWireBytes,
        ),
      );
      assert(error instanceof InvalidOtlpPayload);
      assert.match(error.message, /container nodes/);
      assert.match(error.path, /^resourceMetrics\[/);
    }).pipe(Effect.provide(IngestTest)),
  );

  it.effect("rejects complexity before computing the deterministic batch hash", () => {
    let digestCalled = false;
    const crypto = Crypto.make({
      randomBytes: (size) => new Uint8Array(size),
      digest: () => {
        digestCalled = true;
        return Effect.die("digest must not run");
      },
    });
    const RejectBeforeDigest = CollectorIngestService.layer.pipe(
      Layer.provideMerge([
        TelemetryStore.layerMemory,
        CollectorQuotaUnlimited,
        Layer.succeed(Crypto.Crypto, crypto),
      ]),
    );
    return Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      const error = yield* Effect.flip(
        enqueueValue(ingest, "logs", nestedValue(OtlpAnyValueLimits.maxDepth + 1)),
      );
      assert(error instanceof InvalidOtlpPayload);
      assert.strictEqual(digestCalled, false);
    }).pipe(Effect.provide(RejectBeforeDigest));
  });

  it.effect("rejects excessive depth and total nodes before normalization", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      yield* rejectAcrossSignals(
        ingest,
        nestedValue(OtlpAnyValueLimits.maxDepth + 1),
        `.arrayValue.values[0]`.repeat(OtlpAnyValueLimits.maxDepth),
      );
      yield* rejectAcrossSignals(
        ingest,
        excessiveNodeValue(),
        ".arrayValue.values[9].arrayValue.values[",
      );
    }).pipe(Effect.provide(IngestTest)),
  );

  it.effect("rejects excessive array and key-value list entries", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      yield* rejectAcrossSignals(
        ingest,
        {
          arrayValue: {
            values: Array.from({ length: OtlpAnyValueLimits.maxArrayEntries + 1 }, () => ({
              boolValue: true,
            })),
          },
        },
        ".arrayValue.values",
      );
      yield* rejectAcrossSignals(
        ingest,
        {
          kvlistValue: {
            values: Array.from({ length: OtlpAnyValueLimits.maxKvlistEntries + 1 }, (_, index) => ({
              key: `entry-${index}`,
              value: { intValue: index },
            })),
          },
        },
        ".kvlistValue.values",
      );
    }).pipe(Effect.provide(IngestTest)),
  );

  it.effect("rejects oversized string and bytes values", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      yield* rejectAcrossSignals(
        ingest,
        { stringValue: "x".repeat(OtlpAnyValueLimits.maxStringLength + 1) },
        ".stringValue",
      );
      yield* rejectAcrossSignals(
        ingest,
        { bytesValue: Buffer.alloc(OtlpAnyValueLimits.maxBytesLength + 1).toString("base64") },
        ".bytesValue",
      );
    }).pipe(Effect.provide(IngestTest)),
  );

  it.effect("accepts deep and wide values at the configured boundaries", () =>
    Effect.gen(function* () {
      const ingest = yield* CollectorIngestService;
      for (const signal of signals) {
        const deep = yield* enqueueValue(ingest, signal, nestedValue(OtlpAnyValueLimits.maxDepth));
        const wide = yield* enqueueValue(ingest, signal, {
          arrayValue: {
            values: Array.from({ length: OtlpAnyValueLimits.maxArrayEntries }, () => ({
              boolValue: true,
            })),
          },
        });
        const largeScalars = yield* enqueueValue(ingest, signal, {
          kvlistValue: {
            values: [
              {
                key: "string",
                value: { stringValue: "x".repeat(OtlpAnyValueLimits.maxStringLength) },
              },
              {
                key: "bytes",
                value: {
                  bytesValue: Buffer.alloc(OtlpAnyValueLimits.maxBytesLength).toString("base64"),
                },
              },
            ],
          },
        });
        assert.strictEqual(deep.metrics.length + deep.logs.length + deep.spans.length, 1);
        assert.strictEqual(wide.metrics.length + wide.logs.length + wide.spans.length, 1);
        assert.strictEqual(
          largeScalars.metrics.length + largeScalars.logs.length + largeScalars.spans.length,
          1,
        );
      }
    }).pipe(Effect.provide(IngestTest)),
  );
});
