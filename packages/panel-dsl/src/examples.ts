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
  description: "Separates payment request amplification from real user demand.",
  visualization: "line",
  queries: [
    {
      refId: "REQUESTS",
      metric: "upstream.client.requests",
      aggregation: "rate",
      window: "15m",
      step: "5s",
      axis: "left",
      style: { label: "Upstream request rate", color: "orange" },
    },
    {
      refId: "USERS",
      metric: "http.server.requests",
      aggregation: "count-distinct",
      distinctKey: "user.id",
      window: "15m",
      step: "5s",
      axis: "right",
      style: { label: "Unique users", color: "cyan" },
    },
  ],
  axes: [
    {
      id: "left",
      label: "Upstream requests",
      unit: { _tag: "rate", per: "second", noun: "upstream requests" },
      minimum: 0,
      showGrid: true,
    },
    {
      id: "right",
      label: "Unique users",
      unit: { _tag: "number", format: "short" },
      minimum: 0,
      showGrid: false,
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
  description: "Shows whether payment retries are driving upstream request volume.",
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
      label: "Upstream requests",
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
