import { ProjectId } from "@groundtruth/domain";
import { Schema } from "effect";

export const Cursor = Schema.String.check(Schema.isTrimmed(), Schema.isLengthBetween(1, 512)).pipe(
  Schema.brand("Cursor"),
);
export type Cursor = typeof Cursor.Type;

export const EventCursor = Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,18}$/)).pipe(
  Schema.brand("EventCursor"),
);
export type EventCursor = typeof EventCursor.Type;

export const QueryWindow = Schema.Literals(["5m", "15m", "1h", "3h", "6h", "12h", "24h", "7d"]);
export type QueryWindow = typeof QueryWindow.Type;

export const PageLimitFromString = Schema.FiniteFromString.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 200 }),
);

export const SampleLimitFromString = Schema.FiniteFromString.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 100 }),
);

export const ProjectPath = {
  projectId: ProjectId,
} as const;

export class MutationReceipt extends Schema.Class<MutationReceipt>(
  "Groundtruth/Api/MutationReceipt",
)({
  revision: Schema.Natural,
  occurredAt: Schema.DateTimeUtcFromString,
}) {}
