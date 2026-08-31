import * as NodeSdk from "@effect/opentelemetry/NodeSdk";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Config, Effect, Option, Redacted } from "effect";

const exporterHeaders = Config.redacted("GROUNDTRUTH_INGEST_KEY").pipe(
  Config.option,
  Config.map(
    Option.map((key) => ({
      "x-clear-ingest-key": Redacted.value(key),
    })),
  ),
);

export const BackendTelemetryLive = NodeSdk.layer(
  Effect.gen(function* () {
    const headers = Option.getOrUndefined(yield* exporterHeaders);
    const environment = yield* Config.string("NODE_ENV").pipe(Config.withDefault("development"));
    const serviceVersion = yield* Config.string("RENDER_GIT_COMMIT").pipe(
      Config.withDefault("0.0.0"),
    );
    const exportIntervalMillis = yield* Config.int("OTEL_METRIC_EXPORT_INTERVAL_MS").pipe(
      Config.withDefault(5_000),
    ); // 5 seconds
    const exporterOptions = headers === undefined ? undefined : { headers };

    return {
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(exporterOptions),
        exportIntervalMillis,
      }),
      resource: {
        serviceName: "clear-api",
        serviceVersion,
        attributes: {
          "deployment.environment.name": environment,
          "service.namespace": "clear",
        },
      },
      shutdownTimeout: 5_000, // 5 seconds
      spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter(exporterOptions)),
    };
  }),
);
