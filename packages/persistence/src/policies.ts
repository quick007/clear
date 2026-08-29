import { Schema } from "effect";
import { ProjectQuotas } from "./schema/projects.ts";

export const hostedRawRetentionDays = 1;

export const hostedProjectQuotas = Schema.decodeSync(ProjectQuotas)({
  maxIngestBytesPerMinute: 5_000_000,
  maxActiveSeries: 5_000,
  maxPanels: 12,
});
