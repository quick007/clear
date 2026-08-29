import { Metric } from "effect";

export const checkoutDuration = Metric.histogram("http.server.duration", {
  boundaries: [25, 50, 75, 100, 125, 175, 250, 500, 1_000, 2_000, 5_000],
  description: "Checkout request duration in milliseconds",
});

export const serverRequests = Metric.counter("http.server.requests", {
  description: "Incoming checkout HTTP requests",
  incremental: true,
});

export const upstreamDuration = Metric.histogram("upstream.client.duration", {
  boundaries: [10, 25, 50, 75, 100, 125, 175, 250, 500, 1_000, 2_000],
  description: "Payments dependency request duration in milliseconds",
});

export const upstreamRequests = Metric.counter("upstream.client.requests", {
  description: "Payments dependency request attempts",
  incremental: true,
});

export const replicas = Metric.gauge("service.replicas", {
  description: "Configured checkout-api replica count",
});
