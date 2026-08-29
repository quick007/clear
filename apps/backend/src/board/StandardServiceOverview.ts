import { DashboardName, NonEmptyText, PanelTitle } from "@groundtruth/domain";
import type { SeedDashboardInput } from "@groundtruth/persistence";
import { PanelSpec } from "@groundtruth/panel-dsl";
import type { CanonicalTelemetryBatch } from "@groundtruth/telemetry";
import { Schema } from "effect";

const maximumOverviewServices = 12;
const decodePanel = Schema.decodeUnknownSync(PanelSpec);

const serviceOverviewPanel = (serviceName: string) => {
  const displayName = serviceName.length <= 100 ? serviceName : `${serviceName.slice(0, 99)}…`;
  return decodePanel({
    _tag: "metric-chart",
    version: 1,
    title: `${displayName} overview`,
    description: "Request throughput and latency for this service.",
    visualization: "line",
    queries: [
      {
        refId: "REQUESTS",
        metric: "http.server.requests",
        aggregation: "rate",
        window: "1h",
        step: "30s",
        filters: [{ _tag: "match", attribute: "service.name", operator: "eq", value: serviceName }],
        axis: "left",
        style: { label: "Requests", color: "blue" },
      },
      {
        refId: "LATENCY",
        metric: "http.server.duration",
        aggregation: "p95",
        window: "1h",
        step: "30s",
        filters: [{ _tag: "match", attribute: "service.name", operator: "eq", value: serviceName }],
        axis: "right",
        style: { label: "P95 latency", color: "orange" },
      },
    ],
    axes: [
      {
        id: "left",
        label: "Requests",
        unit: { _tag: "rate", per: "second", noun: "requests" },
        minimum: 0,
      },
      {
        id: "right",
        label: "Latency",
        unit: { _tag: "duration", input: "ms", display: "auto" },
        minimum: 0,
      },
    ],
    legend: { visibility: "always", placement: "bottom", values: ["last", "max"] },
  });
};

export const discoveredServiceNames = (batch: CanonicalTelemetryBatch) =>
  Array.from(
    new Set(
      [...batch.metrics, ...batch.logs, ...batch.spans].map(({ serviceName }) =>
        String(serviceName),
      ),
    ),
  )
    .sort((left, right) => left.localeCompare(right))
    .slice(0, maximumOverviewServices);

export const standardServiceOverview = (
  serviceNames: ReadonlyArray<string>,
): SeedDashboardInput => ({
  name: DashboardName.make("Service overview"),
  description: NonEmptyText.make("Request throughput and latency by discovered service"),
  isDefault: true,
  panels: serviceNames.map((serviceName, position) => {
    const spec = serviceOverviewPanel(serviceName);
    return {
      title: PanelTitle.make(String(spec.title)),
      spec,
      position,
    };
  }),
});
