import {
  AlertId,
  AlertName,
  AlertRuleDefinition,
  AlertSeverity,
  IncidentTitle,
  ManualAlert,
  NonEmptyText,
  ServiceName,
} from "@groundtruth/domain";
import { Schema } from "effect";

export class CreateAlertRequest extends AlertRuleDefinition {}

export class CreateManualAlertRequest extends Schema.Class<CreateManualAlertRequest>(
  "Groundtruth/Api/CreateManualAlertRequest",
)({
  title: AlertName,
  severity: AlertSeverity,
  serviceName: Schema.optional(ServiceName),
  context: Schema.optional(NonEmptyText),
}) {}

export class ManualAlertList extends Schema.Class<ManualAlertList>(
  "Groundtruth/Api/ManualAlertList",
)({
  items: Schema.Array(ManualAlert),
}) {}

export class StartInvestigationRequest extends Schema.Class<StartInvestigationRequest>(
  "Groundtruth/Api/StartInvestigationRequest",
)({
  title: Schema.optional(IncidentTitle),
}) {}

export const AlertPath = {
  alertId: AlertId,
} as const;
