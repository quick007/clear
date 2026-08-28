import * as NodeSdk from "@effect/opentelemetry/NodeSdk";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Config, Effect, Option, Redacted } from "effect";

const exporterHeaders = Config.redacted("GROUNDTRUTH_INGEST_KEY").pipe(
  Config.option,
  Config.map(
    Option.map((key) => ({
      "x-groundtruth-ingest-key": Redacted.value(key),
    })),
  ),
);

export const TelemetryLive = NodeSdk.layer(
  Effect.gen(function* () {
    const headers = Option.getOrUndefined(yield* exporterHeaders);
    const exportIntervalMillis = yield* Config.int("OTEL_METRIC_EXPORT_INTERVAL_MS").pipe(
      Config.withDefault(5_000),
    ); // 5 seconds
    const exporterOptions = headers === undefined ? undefined : { headers };

    return {
      logRecordProcessor: new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter(exporterOptions),
      }),
      loggerMergeWithExisting: true,
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(exporterOptions),
        exportIntervalMillis,
      }),
      resource: {
        serviceName: "payments-stub",
        serviceVersion: "0.0.0",
      },
      shutdownTimeout: 5_000, // 5 seconds
      spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter(exporterOptions)),
    };
  }),
);
