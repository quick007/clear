import {
  Alert,
  AlertSeverity,
  AlertStatus,
  DashboardMetadata,
  DeployEvent,
  Incident,
  Project,
  ServiceName,
  ServiceMetadata,
} from "@groundtruth/domain";
import { Schema } from "effect";
import { SignalHealth } from "@groundtruth/telemetry";
import { QueryWindow } from "./common.ts";

export class ConsoleOverview extends Schema.Class<ConsoleOverview>(
  "Groundtruth/Api/ConsoleOverview",
)({
  project: Project,
  services: Schema.Array(ServiceMetadata),
  signalHealth: Schema.Array(SignalHealth),
  alerts: Schema.Array(Alert),
  openIncident: Schema.NullOr(Incident),
  dashboards: Schema.Array(DashboardMetadata),
  recentDeploys: Schema.Array(DeployEvent),
  suggestedNextSteps: Schema.Array(Schema.String).check(Schema.isMaxLength(6)),
  generatedAt: Schema.DateTimeUtcFromString,
}) {}

export const AlertListQuery = {
  status: Schema.optional(AlertStatus),
  severity: Schema.optional(AlertSeverity),
  service: Schema.optional(ServiceName),
  window: Schema.optional(QueryWindow),
} as const;
