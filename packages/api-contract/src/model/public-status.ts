import { Schema } from "effect";

const PublicStatusName = Schema.String.check(Schema.isLengthBetween(1, 80));
const PublicStatusSummary = Schema.String.check(Schema.isLengthBetween(1, 240));
const PublicStatusVersion = Schema.String.check(Schema.isLengthBetween(1, 80));
const PublicSeriesLabel = Schema.String.check(Schema.isLengthBetween(1, 80));

export const PublicStatusState = Schema.Literals(["operational", "degraded", "unavailable"]);
export type PublicStatusState = typeof PublicStatusState.Type;

export const PublicStatusComponentKey = Schema.Literals(["api", "telemetry", "storage"]);
export type PublicStatusComponentKey = typeof PublicStatusComponentKey.Type;

export const PublicMetricKey = Schema.Literals(["request-rate", "p95-latency"]);
export type PublicMetricKey = typeof PublicMetricKey.Type;

export const PublicMetricUnit = Schema.Literals(["requests/s", "ms"]);
export type PublicMetricUnit = typeof PublicMetricUnit.Type;

export const PublicMetricState = Schema.Literals(["ready", "not-observed"]);
export type PublicMetricState = typeof PublicMetricState.Type;

export class PublicStatusComponent extends Schema.Class<PublicStatusComponent>(
  "Groundtruth/Api/PublicStatusComponent",
)({
  key: PublicStatusComponentKey,
  name: PublicStatusName,
  status: PublicStatusState,
  summary: PublicStatusSummary,
  observedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
}) {}

export class PublicMetricPoint extends Schema.Class<PublicMetricPoint>(
  "Groundtruth/Api/PublicMetricPoint",
)({
  at: Schema.DateTimeUtcFromString,
  value: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
}) {}

export class PublicMetricSeries extends Schema.Class<PublicMetricSeries>(
  "Groundtruth/Api/PublicMetricSeries",
)({
  label: PublicSeriesLabel,
  points: Schema.Array(PublicMetricPoint).check(Schema.isMaxLength(64)),
}) {}

export class PublicStatusMetric extends Schema.Class<PublicStatusMetric>(
  "Groundtruth/Api/PublicStatusMetric",
)({
  key: PublicMetricKey,
  title: PublicStatusName,
  description: PublicStatusSummary,
  unit: PublicMetricUnit,
  status: PublicMetricState,
  series: Schema.Array(PublicMetricSeries).check(Schema.isMaxLength(4)),
}) {}

const PublicStatusResponseStruct = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  status: PublicStatusState,
  summary: PublicStatusSummary,
  version: PublicStatusVersion,
  checkedAt: Schema.DateTimeUtcFromString,
  components: Schema.Array(PublicStatusComponent).check(Schema.isLengthBetween(3, 3)),
  metrics: Schema.Array(PublicStatusMetric).check(Schema.isLengthBetween(2, 2)),
});

const PublicStatusResponseSchema = PublicStatusResponseStruct.check(
  Schema.makeFilter<typeof PublicStatusResponseStruct.Type>((response) => {
    const componentKeys = new Set(response.components.map((component) => component.key));
    if (componentKeys.size !== response.components.length) {
      return { path: ["components"], issue: "component keys must be unique" };
    }

    const metricKeys = new Set(response.metrics.map((metric) => metric.key));
    if (metricKeys.size !== response.metrics.length) {
      return { path: ["metrics"], issue: "metric keys must be unique" };
    }

    return undefined;
  }),
);

export class PublicStatusResponse extends Schema.Class<PublicStatusResponse>(
  "Groundtruth/Api/PublicStatusResponse",
)(PublicStatusResponseSchema) {}
