import { metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

const instrumentationName = "node-otel-example";

const createSdk = () =>
  new NodeSDK({
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter(),
      }),
    ],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
      }),
    ],
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
  });

export const emitExample = async () => {
  const sdk = createSdk();
  sdk.start();

  try {
    const completedJobs = metrics
      .getMeter(instrumentationName)
      .createCounter("example.jobs.completed", {
        description: "Number of example jobs completed",
        unit: "{job}",
      });
    const logger = logs.getLogger(instrumentationName);
    const tracer = trace.getTracer(instrumentationName);

    await tracer.startActiveSpan("example.job", async (span) => {
      try {
        span.setAttributes({
          "example.job.id": "job-42",
          "example.job.type": "verification",
        });
        completedJobs.add(1, {
          "example.job.type": "verification",
          result: "success",
        });
        logger.emit({
          attributes: {
            "example.job.id": "job-42",
            "example.job.type": "verification",
          },
          body: {
            action: "job.completed",
            jobId: "job-42",
            result: "success",
          },
          severityNumber: SeverityNumber.INFO,
          severityText: "INFO",
        });
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  } finally {
    await sdk.shutdown();
  }
};

if (import.meta.main) {
  await emitExample();
  console.log("Exported one metric, one structured log, and one trace over OTLP/HTTP.");
}
