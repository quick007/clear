import { Schema } from "effect";
import { MetricChartPanel } from "./panels.ts";

const decodeMetricChart = Schema.decodeUnknownSync(MetricChartPanel);

export const PaymentRequestRatePanel = decodeMetricChart({
  _tag: "metric-chart",
  version: 1,
  title: "Payment request rate",
  description: "Total payment attempts and failed responses from checkout.",
  visualization: "line",
  queries: [
    {
      refId: "REQUESTS",
      metric: "upstream.client.requests",
      aggregation: "rate",
      window: "15m",
      step: "5s",
      axis: "left",
      style: { label: "Payment requests", color: "orange" },
    },
    {
      refId: "FAILURES",
      metric: "upstream.client.requests",
      aggregation: "rate",
      window: "15m",
      step: "5s",
      filters: [
        {
          _tag: "match",
          attribute: "http.response.status_code",
          operator: "eq",
          value: 503,
        },
      ],
      axis: "right",
      style: { label: "Failed requests", color: "red" },
    },
  ],
  axes: [
    {
      id: "left",
      label: "Payment requests",
      unit: { _tag: "rate", per: "second", noun: "requests" },
      minimum: 0,
      showGrid: true,
    },
    {
      id: "right",
      label: "Failed requests",
      unit: { _tag: "rate", per: "second", noun: "errors" },
      minimum: 0,
      showGrid: false,
    },
  ],
  thresholds: [
    {
      value: 90,
      condition: "at_or_above",
      severity: "critical",
      label: "Alert threshold",
      axis: "left",
    },
  ],
  legend: { visibility: "always", placement: "bottom", values: ["last"] },
});

export const CheckoutLatencyPanel = decodeMetricChart({
  _tag: "metric-chart",
  version: 1,
  title: "Checkout latency",
  description: "The p95 response time experienced by checkout requests.",
  visualization: "line",
  queries: [
    {
      refId: "LATENCY",
      metric: "http.server.duration",
      aggregation: "p95",
      window: "15m",
      step: "5s",
      axis: "left",
      style: { label: "p95 latency", color: "cyan" },
    },
  ],
  axes: [
    {
      id: "left",
      label: "Response time",
      unit: { _tag: "duration", input: "ms", display: "ms", decimals: 0 },
      minimum: 0,
      showGrid: true,
    },
  ],
  thresholds: [
    {
      value: 600,
      condition: "at_or_above",
      severity: "warning",
      label: "Slow checkout",
      axis: "left",
    },
  ],
  legend: { visibility: "hidden" },
});

export const RequestsVsUsersPanel = decodeMetricChart({
  _tag: "metric-chart",
  version: 1,
  title: "Upstream requests vs unique users",
  description: "Indexes payment work and user demand to their five-minute healthy baseline.",
  visualization: "line",
  queries: [
    {
      refId: "REQUESTS",
      metric: "upstream.client.requests",
      aggregation: "rate",
      window: "15m",
      step: "5s",
      axis: "left",
      normalization: { _tag: "baseline-ratio", window: "5m" },
      style: { label: "Upstream request rate", color: "orange" },
    },
    {
      refId: "USERS",
      metric: "http.server.requests",
      aggregation: "count-distinct",
      distinctKey: "user.id",
      window: "15m",
      step: "5s",
      axis: "left",
      normalization: { _tag: "baseline-ratio", window: "5m" },
      style: { label: "Unique users", color: "cyan", lineStyle: "dashed" },
    },
  ],
  axes: [
    {
      id: "left",
      label: "Healthy baseline = 1.0",
      unit: { _tag: "custom", symbol: "× baseline", position: "after", decimals: 1 },
      minimum: 0.8,
      maximum: 3.3,
      showGrid: true,
    },
  ],
  thresholds: [
    {
      value: 1,
      condition: "at_or_above",
      severity: "info",
      label: "Healthy baseline",
      axis: "left",
    },
  ],
  legend: {
    visibility: "always",
    placement: "bottom",
    values: ["last", "max"],
  },
});

export const RetryAmplificationPanel = decodeMetricChart({
  _tag: "metric-chart",
  version: 1,
  title: "Upstream requests by attempt",
  description: "Stacks original payment attempts and retries into total upstream work.",
  visualization: "area",
  queries: [
    {
      refId: "ATTEMPTS",
      metric: "upstream.client.requests",
      aggregation: "rate",
      window: "15m",
      step: "5s",
      groupBy: {
        attributes: ["attempt"],
        maxSeries: 3,
      },
      axis: "left",
    },
  ],
  axes: [
    {
      id: "left",
      label: "Payment attempts",
      unit: { _tag: "rate", per: "second", noun: "upstream requests" },
      minimum: 0,
    },
  ],
  stacking: "normal",
  legend: { visibility: "always", placement: "bottom" },
});

export const UpstreamPressurePanel = decodeMetricChart({
  _tag: "metric-chart",
  version: 1,
  title: "Upstream errors and replicas",
  description: "Compares upstream pressure with checkout service concurrency.",
  visualization: "line",
  queries: [
    {
      refId: "ERRORS",
      metric: "upstream.client.requests",
      aggregation: "rate",
      window: "1h",
      step: "30s",
      filters: [
        {
          _tag: "match",
          attribute: "http.response.status_code",
          operator: "eq",
          value: 503,
        },
      ],
      axis: "left",
      style: { label: "Upstream errors", color: "red" },
    },
    {
      refId: "REPLICAS",
      metric: "service.replicas",
      aggregation: "avg",
      window: "1h",
      step: "30s",
      axis: "right",
      style: { label: "Replicas", color: "blue", lineStyle: "dashed" },
    },
  ],
  axes: [
    {
      id: "left",
      label: "Errors",
      unit: { _tag: "rate", per: "second", noun: "errors" },
      minimum: 0,
    },
    {
      id: "right",
      label: "Replicas",
      unit: { _tag: "number", format: "decimal", decimals: 0 },
      minimum: 0,
    },
  ],
  thresholds: [
    {
      value: 5,
      condition: "at_or_above",
      severity: "critical",
      label: "Error budget burn",
      axis: "left",
    },
  ],
  legend: { visibility: "always", placement: "bottom" },
});

export const GoldenPanels = [
  PaymentRequestRatePanel,
  CheckoutLatencyPanel,
  RequestsVsUsersPanel,
  RetryAmplificationPanel,
  UpstreamPressurePanel,
] as const;
