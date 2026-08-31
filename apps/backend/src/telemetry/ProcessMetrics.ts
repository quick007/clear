import { Effect, Layer, Metric, Schedule } from "effect";
import { processHeapUsed, processResidentMemory, processUptime } from "./BackendMetrics.js";

const processMetricInterval = "5 seconds"; // 5 seconds

export const recordProcessMetrics = Effect.fn("ProcessMetrics.record")(function* () {
  const memory = process.memoryUsage();
  yield* Effect.all(
    [
      Metric.update(processUptime, process.uptime()),
      Metric.update(processResidentMemory, memory.rss),
      Metric.update(processHeapUsed, memory.heapUsed),
    ],
    { discard: true },
  );
});

export const ProcessMetricsLive = Layer.effectDiscard(
  recordProcessMetrics().pipe(
    Effect.repeat(Schedule.spaced(processMetricInterval)),
    Effect.forkScoped,
  ),
);
