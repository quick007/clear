import { Metric } from "effect";

export const requestDuration = Metric.histogram("http.server.duration", {
  boundaries: [10, 25, 50, 75, 100, 125, 175, 250, 500, 1_000, 2_000],
  description: "Payment authorization duration in milliseconds",
});

export const requests = Metric.counter("http.server.requests", {
  description: "Payment authorization requests",
  incremental: true,
});

export const effectiveFailureRate = Metric.gauge("payments.effective_failure_rate", {
  description: "Current failure probability after overload feedback",
});

export const windowRequests = Metric.gauge("payments.window_requests", {
  description: "Requests observed in the current one-second failure window",
});

export const replicas = Metric.gauge("service.replicas", {
  description: "Configured payments-stub replica count",
});
