import { Metric } from "effect";

export const backendRequests = Metric.counter("http.server.requests", {
  description: "Incoming Clear API requests",
  incremental: true,
});

export const backendRequestDuration = Metric.histogram("http.server.duration", {
  boundaries: [5, 10, 25, 50, 75, 100, 175, 250, 500, 1_000, 2_000, 5_000],
  description: "Clear API request duration in milliseconds",
});

export const processUptime = Metric.gauge("process.uptime", {
  description: "Clear API process uptime in seconds",
});

export const processResidentMemory = Metric.gauge("process.runtime.nodejs.memory.rss", {
  description: "Clear API resident memory in bytes",
});

export const processHeapUsed = Metric.gauge("process.runtime.nodejs.memory.heap.used", {
  description: "Clear API JavaScript heap used in bytes",
});
