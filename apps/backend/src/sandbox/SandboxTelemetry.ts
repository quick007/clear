import type { TelemetryBatch as GeneratedTelemetryBatch } from "@groundtruth/telemetry-gen";
import {
  CanonicalTelemetryBatch,
  CollectorBatchId,
  DoubleMetricValue,
  GaugePoint,
  HistogramPoint,
  InstrumentationScope,
  IntegerMetricValue,
  LogRecord,
  MetricName,
  OtelFlags,
  ResourceContext,
  ServiceName,
  SpanEvent,
  SpanId,
  SpanRecord,
  SpanStatus,
  SumPoint,
  TraceId,
  UnixNano,
  type MetricPoint,
} from "@groundtruth/telemetry";
import { DateTime } from "effect";

const scope = new InstrumentationScope({
  name: "groundtruth.telemetry-gen",
  version: null,
  attributes: {},
  droppedAttributesCount: 0n,
  schemaUrl: null,
});

const metricDetails: Record<
  string,
  {
    readonly description: string;
    readonly unit: string;
  }
> = {
  "http.server.requests": {
    description: "Completed HTTP server requests",
    unit: "{request}",
  },
  "http.server.duration": {
    description: "HTTP server request duration",
    unit: "ms",
  },
  "upstream.client.requests": {
    description: "Requests to an upstream service",
    unit: "{request}",
  },
  "upstream.client.duration": {
    description: "Upstream request duration",
    unit: "ms",
  },
  "service.replicas": {
    description: "Active service replicas",
    unit: "{replica}",
  },
};

const severityNumber = {
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
} as const;

const unixNano = (milliseconds: number, offsetMilliseconds: number) =>
  UnixNano.make(BigInt(milliseconds + offsetMilliseconds) * 1_000_000n);

const serviceName = (attributes: Readonly<Record<string, unknown>>, fallback: string) => {
  const named = attributes["service.name"];
  return ServiceName.make(typeof named === "string" ? named : fallback);
};

const resource = (service: ServiceName) =>
  new ResourceContext({
    attributes: { "service.name": service },
    droppedAttributesCount: 0n,
    entityRefs: [],
    schemaUrl: null,
  });

const pointBase = (
  point: GeneratedTelemetryBatch["metrics"][number],
  offsetMilliseconds: number,
) => {
  const service = serviceName(point.attributes, "checkout-api");
  const details = metricDetails[point.metric] ?? { description: "", unit: "" };
  return {
    name: MetricName.make(point.metric),
    description: details.description,
    unit: details.unit,
    metadata: {},
    resource: resource(service),
    scope,
    serviceName: service,
    startTimeUnixNano: null,
    timeUnixNano: unixNano(point.timestamp, offsetMilliseconds),
    attributes: point.attributes,
    exemplars: [],
    flags: OtelFlags.make(0),
  };
};

export const histogramBucketCounts = (count: number) => {
  const throughP50 = Math.ceil(count * 0.5);
  const throughP95 = Math.ceil(count * 0.95);
  const throughP99 = Math.ceil(count * 0.99);
  return [throughP50, throughP95 - throughP50, throughP99 - throughP95, count - throughP99, 0].map(
    BigInt,
  );
};

const metricPoint = (
  point: GeneratedTelemetryBatch["metrics"][number],
  offsetMilliseconds: number,
): MetricPoint => {
  switch (point._tag) {
    case "Sum":
      return new SumPoint({
        ...pointBase(point, offsetMilliseconds),
        value: new IntegerMetricValue({ value: BigInt(point.value) }),
        temporality: "delta",
        monotonic: true,
      });
    case "Gauge":
      return new GaugePoint({
        ...pointBase(point, offsetMilliseconds),
        value: new DoubleMetricValue({ value: point.value }),
      });
    case "Histogram":
      return new HistogramPoint({
        ...pointBase(point, offsetMilliseconds),
        temporality: "delta",
        count: BigInt(point.count),
        sum: point.sum,
        minimum: point.min,
        maximum: point.max,
        explicitBounds: [point.p50, point.p95, point.p99, point.max],
        bucketCounts: histogramBucketCounts(point.count),
      });
  }
};

const logRecord = (record: GeneratedTelemetryBatch["logs"][number], offsetMilliseconds: number) => {
  const service = ServiceName.make(record.service);
  return new LogRecord({
    timeUnixNano: unixNano(record.timestamp, offsetMilliseconds),
    observedTimeUnixNano: unixNano(record.timestamp, offsetMilliseconds),
    traceId: record.traceId === null ? null : TraceId.make(record.traceId),
    spanId: record.spanId === null ? null : SpanId.make(record.spanId),
    flags: OtelFlags.make(0),
    severity: record.severity,
    severityNumber: severityNumber[record.severity],
    severityText: record.severity,
    body: record.body,
    eventName: null,
    attributes: record.attributes,
    droppedAttributesCount: 0n,
    resource: resource(service),
    scope,
    serviceName: service,
  });
};

const spanRecord = (
  span: GeneratedTelemetryBatch["traces"][number]["spans"][number],
  offsetMilliseconds: number,
) => {
  const service = ServiceName.make(span.service);
  const durationMilliseconds = Math.max(0, span.endTime - span.startTime);
  return new SpanRecord({
    traceId: TraceId.make(span.traceId),
    spanId: SpanId.make(span.spanId),
    parentSpanId: span.parentSpanId === null ? null : SpanId.make(span.parentSpanId),
    traceState: "",
    flags: OtelFlags.make(0),
    name: span.name,
    kind: span.kind,
    startTimeUnixNano: unixNano(span.startTime, offsetMilliseconds),
    endTimeUnixNano: unixNano(span.endTime, offsetMilliseconds),
    durationNanos: BigInt(durationMilliseconds) * 1_000_000n,
    status: new SpanStatus({ code: span.status, message: "" }),
    attributes: span.attributes,
    droppedAttributesCount: 0n,
    events: span.events.map(
      (event) =>
        new SpanEvent({
          name: event.name,
          timeUnixNano: unixNano(event.timestamp, offsetMilliseconds),
          attributes: event.attributes,
          droppedAttributesCount: 0n,
        }),
    ),
    droppedEventsCount: 0n,
    links: [],
    droppedLinksCount: 0n,
    resource: resource(service),
    scope,
    serviceName: service,
  });
};

export const canonicalSandboxBatch = (
  batch: GeneratedTelemetryBatch,
  id: string,
  offsetMilliseconds = 0,
) =>
  new CanonicalTelemetryBatch({
    id: CollectorBatchId.make(id),
    receivedAt: DateTime.fromDateUnsafe(new Date(batch.bucketEnd + offsetMilliseconds)),
    metrics: batch.metrics.map((point) => metricPoint(point, offsetMilliseconds)),
    logs: batch.logs.map((record) => logRecord(record, offsetMilliseconds)),
    spans: batch.traces.flatMap((trace) =>
      trace.spans.map((span) => spanRecord(span, offsetMilliseconds)),
    ),
  });
