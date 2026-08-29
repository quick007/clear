import type { OtlpMetricsRequest } from "@groundtruth/api-contract";
import {
  DoubleMetricValue,
  Exemplar,
  ExponentialBuckets,
  ExponentialHistogramPoint,
  GaugePoint,
  HistogramPoint,
  IntegerMetricValue,
  MetricName,
  type MetricNumberValue,
  type MetricPoint,
  type MetricTemporality,
  QuantileValue,
  SummaryPoint,
  SumPoint,
} from "@groundtruth/telemetry";
import { Effect } from "effect";
import { InvalidOtlpPayload } from "./InvalidOtlpPayload.js";
import { optionalSpanId, optionalTraceId } from "./OtlpIds.js";
import { optionalUnixNano, otelFlags, signedInt64, unixNano, unsignedInt64 } from "./OtlpNumber.js";
import { attributes, instrumentationScope, resourceContext, serviceName } from "./OtlpValue.js";

type ResourceMetrics = NonNullable<OtlpMetricsRequest["resourceMetrics"]>[number];
type ScopeMetrics = NonNullable<ResourceMetrics["scopeMetrics"]>[number];
type OtlpMetric = NonNullable<ScopeMetrics["metrics"]>[number];
type NumberPoint = NonNullable<NonNullable<OtlpMetric["gauge"]>["dataPoints"]>[number];
type ExemplarInput = NonNullable<NumberPoint["exemplars"]>[number];

const numberValue = (
  point: {
    readonly asDouble?: number;
    readonly asInt?: string | number;
  },
  path: string,
): Effect.Effect<MetricNumberValue, InvalidOtlpPayload> =>
  Effect.gen(function* () {
    const present = [point.asDouble !== undefined, point.asInt !== undefined].filter(
      Boolean,
    ).length;
    if (present !== 1) {
      return yield* new InvalidOtlpPayload({
        path,
        message: "Number data must contain exactly one of asDouble or asInt",
      });
    }
    return point.asDouble !== undefined
      ? new DoubleMetricValue({ value: point.asDouble })
      : new IntegerMetricValue({ value: yield* signedInt64(point.asInt, `${path}.asInt`) });
  });

const exemplar = (input: ExemplarInput, path: string) =>
  Effect.gen(function* () {
    return new Exemplar({
      timeUnixNano: yield* unixNano(input.timeUnixNano, `${path}.timeUnixNano`),
      value: yield* numberValue(input, path),
      filteredAttributes: yield* attributes(input.filteredAttributes, `${path}.filteredAttributes`),
      traceId: yield* optionalTraceId(input.traceId, `${path}.traceId`),
      spanId: yield* optionalSpanId(input.spanId, `${path}.spanId`),
    });
  });

const exemplars = (items: ReadonlyArray<ExemplarInput> | undefined, path: string) =>
  Effect.forEach(items ?? [], (item, index) => exemplar(item, `${path}[${index}]`));

const temporality = (value: 0 | 1 | 2 | undefined): MetricTemporality => {
  if (value === 1) return "delta";
  if (value === 2) return "cumulative";
  return "unspecified";
};

const metricName = (value: string | undefined, path: string) =>
  Effect.gen(function* () {
    const normalized = value?.trim() ?? "";
    if (normalized.length === 0 || normalized.length > 255) {
      return yield* new InvalidOtlpPayload({
        path,
        message: "Metric name must contain between 1 and 255 characters",
      });
    }
    return MetricName.make(normalized);
  });

export const normalizeMetrics = (request: OtlpMetricsRequest) =>
  Effect.gen(function* () {
    const normalized: Array<MetricPoint> = [];

    for (const [resourceIndex, resourceMetrics] of (request.resourceMetrics ?? []).entries()) {
      const resourcePath = `resourceMetrics[${resourceIndex}].resource`;
      const resource = yield* resourceContext(
        resourceMetrics.resource,
        resourceMetrics.schemaUrl,
        resourcePath,
      );
      const service = serviceName(resource);
      for (const [scopeIndex, scopeMetrics] of (resourceMetrics.scopeMetrics ?? []).entries()) {
        const scopePath = `resourceMetrics[${resourceIndex}].scopeMetrics[${scopeIndex}].scope`;
        const scope = yield* instrumentationScope(
          scopeMetrics.scope,
          scopeMetrics.schemaUrl,
          scopePath,
        );
        for (const [metricIndex, metric] of (scopeMetrics.metrics ?? []).entries()) {
          const path = `resourceMetrics[${resourceIndex}].scopeMetrics[${scopeIndex}].metrics[${metricIndex}]`;
          const kinds = [
            metric.gauge,
            metric.sum,
            metric.histogram,
            metric.exponentialHistogram,
            metric.summary,
          ].filter((kind) => kind !== undefined);
          if (kinds.length !== 1) {
            return yield* new InvalidOtlpPayload({
              path,
              message: "Metric must contain exactly one supported data type",
            });
          }
          const name = yield* metricName(metric.name, `${path}.name`);
          const shared = {
            name,
            description: metric.description ?? "",
            unit: metric.unit ?? "",
            metadata: yield* attributes(metric.metadata, `${path}.metadata`),
            resource,
            scope,
            serviceName: service,
          };

          if (metric.gauge !== undefined) {
            for (const [pointIndex, point] of (metric.gauge.dataPoints ?? []).entries()) {
              const pointPath = `${path}.gauge.dataPoints[${pointIndex}]`;
              normalized.push(
                new GaugePoint({
                  ...shared,
                  startTimeUnixNano: yield* optionalUnixNano(
                    point.startTimeUnixNano,
                    `${pointPath}.startTimeUnixNano`,
                  ),
                  timeUnixNano: yield* unixNano(point.timeUnixNano, `${pointPath}.timeUnixNano`),
                  attributes: yield* attributes(point.attributes, `${pointPath}.attributes`),
                  exemplars: yield* exemplars(point.exemplars, `${pointPath}.exemplars`),
                  flags: yield* otelFlags(point.flags, `${pointPath}.flags`),
                  value: yield* numberValue(point, pointPath),
                }),
              );
            }
            continue;
          }

          if (metric.sum !== undefined) {
            for (const [pointIndex, point] of (metric.sum.dataPoints ?? []).entries()) {
              const pointPath = `${path}.sum.dataPoints[${pointIndex}]`;
              normalized.push(
                new SumPoint({
                  ...shared,
                  startTimeUnixNano: yield* optionalUnixNano(
                    point.startTimeUnixNano,
                    `${pointPath}.startTimeUnixNano`,
                  ),
                  timeUnixNano: yield* unixNano(point.timeUnixNano, `${pointPath}.timeUnixNano`),
                  attributes: yield* attributes(point.attributes, `${pointPath}.attributes`),
                  exemplars: yield* exemplars(point.exemplars, `${pointPath}.exemplars`),
                  flags: yield* otelFlags(point.flags, `${pointPath}.flags`),
                  value: yield* numberValue(point, pointPath),
                  temporality: temporality(metric.sum.aggregationTemporality),
                  monotonic: metric.sum.isMonotonic ?? false,
                }),
              );
            }
            continue;
          }

          if (metric.histogram !== undefined) {
            for (const [pointIndex, point] of (metric.histogram.dataPoints ?? []).entries()) {
              const pointPath = `${path}.histogram.dataPoints[${pointIndex}]`;
              normalized.push(
                new HistogramPoint({
                  ...shared,
                  startTimeUnixNano: yield* optionalUnixNano(
                    point.startTimeUnixNano,
                    `${pointPath}.startTimeUnixNano`,
                  ),
                  timeUnixNano: yield* unixNano(point.timeUnixNano, `${pointPath}.timeUnixNano`),
                  attributes: yield* attributes(point.attributes, `${pointPath}.attributes`),
                  exemplars: yield* exemplars(point.exemplars, `${pointPath}.exemplars`),
                  flags: yield* otelFlags(point.flags, `${pointPath}.flags`),
                  temporality: temporality(metric.histogram.aggregationTemporality),
                  count: yield* unsignedInt64(point.count, `${pointPath}.count`),
                  sum: point.sum ?? null,
                  minimum: point.min ?? null,
                  maximum: point.max ?? null,
                  explicitBounds: point.explicitBounds ?? [],
                  bucketCounts: yield* Effect.forEach(point.bucketCounts ?? [], (count, index) =>
                    unsignedInt64(count, `${pointPath}.bucketCounts[${index}]`),
                  ),
                }),
              );
            }
            continue;
          }

          if (metric.exponentialHistogram !== undefined) {
            for (const [pointIndex, point] of (
              metric.exponentialHistogram.dataPoints ?? []
            ).entries()) {
              const pointPath = `${path}.exponentialHistogram.dataPoints[${pointIndex}]`;
              normalized.push(
                new ExponentialHistogramPoint({
                  ...shared,
                  startTimeUnixNano: yield* optionalUnixNano(
                    point.startTimeUnixNano,
                    `${pointPath}.startTimeUnixNano`,
                  ),
                  timeUnixNano: yield* unixNano(point.timeUnixNano, `${pointPath}.timeUnixNano`),
                  attributes: yield* attributes(point.attributes, `${pointPath}.attributes`),
                  exemplars: yield* exemplars(point.exemplars, `${pointPath}.exemplars`),
                  flags: yield* otelFlags(point.flags, `${pointPath}.flags`),
                  temporality: temporality(metric.exponentialHistogram.aggregationTemporality),
                  count: yield* unsignedInt64(point.count, `${pointPath}.count`),
                  sum: point.sum ?? null,
                  minimum: point.min ?? null,
                  maximum: point.max ?? null,
                  scale: point.scale ?? 0,
                  zeroCount: yield* unsignedInt64(point.zeroCount, `${pointPath}.zeroCount`),
                  zeroThreshold: point.zeroThreshold ?? 0,
                  positive: new ExponentialBuckets({
                    offset: point.positive?.offset ?? 0,
                    bucketCounts: yield* Effect.forEach(
                      point.positive?.bucketCounts ?? [],
                      (count, index) =>
                        unsignedInt64(count, `${pointPath}.positive.bucketCounts[${index}]`),
                    ),
                  }),
                  negative: new ExponentialBuckets({
                    offset: point.negative?.offset ?? 0,
                    bucketCounts: yield* Effect.forEach(
                      point.negative?.bucketCounts ?? [],
                      (count, index) =>
                        unsignedInt64(count, `${pointPath}.negative.bucketCounts[${index}]`),
                    ),
                  }),
                }),
              );
            }
            continue;
          }

          if (metric.summary !== undefined) {
            for (const [pointIndex, point] of (metric.summary.dataPoints ?? []).entries()) {
              const pointPath = `${path}.summary.dataPoints[${pointIndex}]`;
              const quantiles = yield* Effect.forEach(point.quantileValues ?? [], (item, index) => {
                const quantile = item.quantile ?? 0;
                return quantile < 0 || quantile > 1
                  ? new InvalidOtlpPayload({
                      path: `${pointPath}.quantileValues[${index}].quantile`,
                      message: "Summary quantile must be between 0 and 1",
                    })
                  : Effect.succeed(new QuantileValue({ quantile, value: item.value ?? 0 }));
              });
              normalized.push(
                new SummaryPoint({
                  ...shared,
                  startTimeUnixNano: yield* optionalUnixNano(
                    point.startTimeUnixNano,
                    `${pointPath}.startTimeUnixNano`,
                  ),
                  timeUnixNano: yield* unixNano(point.timeUnixNano, `${pointPath}.timeUnixNano`),
                  attributes: yield* attributes(point.attributes, `${pointPath}.attributes`),
                  exemplars: [],
                  flags: yield* otelFlags(point.flags, `${pointPath}.flags`),
                  count: yield* unsignedInt64(point.count, `${pointPath}.count`),
                  sum: point.sum ?? 0,
                  quantiles,
                }),
              );
            }
            continue;
          }
        }
      }
    }

    return normalized;
  });
