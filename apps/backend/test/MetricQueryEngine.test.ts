import { assert, describe, it } from "@effect/vitest";
import {
  HistogramPoint,
  InstrumentationScope,
  MetricName,
  MetricQuery,
  OtelFlags,
  ResourceContext,
  ServiceName,
  UnixNano,
} from "@groundtruth/telemetry";
import { DateTime, Effect } from "effect";
import { queryMetricPoints } from "../src/telemetry/MetricQueryEngine.js";

const metricName = MetricName.make("http.server.duration");
const observedAt = UnixNano.make(1_787_884_800_000_000_000n);
const resource = new ResourceContext({
  attributes: { "service.name": "checkout-api" },
  droppedAttributesCount: 0n,
  entityRefs: [],
  schemaUrl: null,
});
const scope = new InstrumentationScope({
  name: "groundtruth.test",
  version: null,
  attributes: {},
  droppedAttributesCount: 0n,
  schemaUrl: null,
});

const histogram = (
  count: bigint,
  sum: number,
  maximum: number,
  bucketCounts: ReadonlyArray<bigint>,
) =>
  new HistogramPoint({
    name: metricName,
    description: "Server latency",
    unit: "ms",
    metadata: {},
    resource,
    scope,
    serviceName: ServiceName.make("checkout-api"),
    startTimeUnixNano: null,
    timeUnixNano: observedAt,
    attributes: {},
    exemplars: [],
    flags: OtelFlags.make(0),
    temporality: "delta",
    count,
    sum,
    minimum: 1,
    maximum,
    explicitBounds: [100],
    bucketCounts,
  });

describe("MetricQueryEngine", () => {
  it.effect("weights merged histogram percentiles by bucket counts", () =>
    Effect.gen(function* () {
      const result = yield* queryMetricPoints(
        [histogram(100n, 5_000, 100, [100n, 0n]), histogram(1n, 1_000, 1_000, [0n, 1n])],
        new MetricQuery({
          metric: metricName,
          aggregation: "p95",
          range: {
            _tag: "absolute",
            start: DateTime.fromDateUnsafe(new Date("2026-08-28T02:39:50.000Z")),
            end: DateTime.fromDateUnsafe(new Date("2026-08-28T02:40:10.000Z")),
          },
          step: "10s",
        }),
      );

      assert.deepStrictEqual(
        result.series[0]?.points.map((point) => point.value),
        [100],
      );
    }),
  );

  it.effect("accepts seven day windows and rejects anything wider", () =>
    Effect.gen(function* () {
      const at = DateTime.fromDateUnsafe(new Date(Number(observedAt / 1_000_000n)));
      const sevenDays = new MetricQuery({
        metric: metricName,
        aggregation: "count",
        range: {
          _tag: "absolute",
          start: DateTime.subtract(at, { days: 7 }),
          end: at,
        },
      });
      const wider = new MetricQuery({
        metric: metricName,
        aggregation: "count",
        range: {
          _tag: "absolute",
          start: DateTime.subtract(at, { days: 7, seconds: 1 }),
          end: at,
        },
      });

      const accepted = yield* queryMetricPoints([histogram(1n, 10, 10, [1n, 0n])], sevenDays);
      assert.strictEqual(accepted.pointCount, 1);
      const rejected = yield* Effect.flip(
        queryMetricPoints([histogram(1n, 10, 10, [1n, 0n])], wider),
      );
      assert.strictEqual(rejected._tag, "QueryTooBroad");
      if (rejected._tag === "QueryTooBroad") {
        assert.strictEqual(rejected.maximumWindowSeconds, 7 * 24 * 60 * 60);
      }
    }),
  );
});
