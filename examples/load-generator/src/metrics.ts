import { Metric } from "effect";

export const generatedRequests = Metric.counter("load_generator.requests", {
  description: "Checkout requests emitted by the scenario generator",
  incremental: true,
});

export const generatedDuration = Metric.histogram("load_generator.request_duration", {
  boundaries: [25, 50, 75, 100, 125, 175, 250, 500, 1_000, 2_000, 5_000],
  description: "Generated checkout request duration in milliseconds",
});

export const configuredRate = Metric.gauge("load_generator.configured_rate", {
  description: "Configured checkout requests per second",
});

export const configuredUsers = Metric.gauge("load_generator.unique_users", {
  description: "Configured deterministic user pool size",
});

export const scenarioPhase = Metric.gauge("load_generator.phase", {
  description: "Numeric scenario phase for operational inspection",
});
