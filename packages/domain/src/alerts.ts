import { Schema } from "effect";
import { AlertId, ProjectId } from "./ids.ts";
import { AlertName, AlertSeverity, AlertStatus, NonEmptyText, ServiceName } from "./primitives.ts";

export const AlertAggregation = Schema.Literals([
  "sum",
  "avg",
  "min",
  "max",
  "count",
  "rate",
  "p50",
  "p95",
  "p99",
  "count-distinct",
]);
export type AlertAggregation = typeof AlertAggregation.Type;

export const AlertComparison = Schema.Literals(["above", "at-or-above", "below", "at-or-below"]);
export type AlertComparison = typeof AlertComparison.Type;

export class AlertRuleDefinition extends Schema.Class<AlertRuleDefinition>(
  "Groundtruth/AlertRuleDefinition",
)({
  name: AlertName,
  serviceName: ServiceName,
  metricName: Schema.String.check(Schema.isLengthBetween(1, 255)),
  aggregation: AlertAggregation,
  comparison: AlertComparison,
  threshold: Schema.Finite,
  windowSeconds: Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 86_400 })),
  severity: AlertSeverity,
  enabled: Schema.Boolean,
}) {}

export class Alert extends Schema.Class<Alert>("Groundtruth/Alert")({
  id: AlertId,
  projectId: ProjectId,
  name: AlertName,
  serviceName: Schema.NullOr(ServiceName),
  metricName: Schema.String.check(Schema.isLengthBetween(1, 255)),
  aggregation: AlertAggregation,
  comparison: AlertComparison,
  threshold: Schema.Finite,
  windowSeconds: Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 86_400 })),
  severity: AlertSeverity,
  status: AlertStatus,
  summary: Schema.NullOr(NonEmptyText),
  enabled: Schema.Boolean,
  firingSince: Schema.NullOr(Schema.DateTimeUtcFromString),
  resolvedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export class ManualAlert extends Schema.Class<ManualAlert>("Groundtruth/ManualAlert")({
  id: AlertId,
  projectId: ProjectId,
  title: AlertName,
  severity: AlertSeverity,
  serviceName: Schema.NullOr(ServiceName),
  context: Schema.NullOr(NonEmptyText),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
