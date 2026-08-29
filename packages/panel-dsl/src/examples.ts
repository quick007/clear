import { Schema } from "effect";
import { MetricChartPanel } from "./panels.ts";

const decodeMetricChart = Schema.decodeUnknownSync(MetricChartPanel);

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
      window: "1h",
      step: "30s",
      axis: "left",
      style: { label: "Upstream request rate", color: "orange" },
    },
    {
      refId: "USERS",
      metric: "http.server.requests",
      aggregation: "count-distinct",
      distinctKey: "user.id",
      window: "1h",
      step: "30s",
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
      window: "1h",
      step: "30s",
      groupBy: {
        attributes: ["attempt", "retry"],
        maxSeries: 4,
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
  RequestsVsUsersPanel,
  RetryAmplificationPanel,
  UpstreamPressurePanel,
] as const;
