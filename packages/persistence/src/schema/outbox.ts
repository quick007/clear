import type { ProjectId } from "@groundtruth/domain";
import { bigint, index, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { outboxEventKindEnum } from "./enums.ts";
import { projects } from "./projects.ts";

export type OutboxPayload = Readonly<
  Record<string, string | number | boolean | null | ReadonlyArray<string>>
>;

export const outboxEvents = pgTable(
  "outbox_events",
  {
    sequence: bigint("sequence", { mode: "bigint" }).generatedAlwaysAsIdentity().primaryKey(),
    projectId: uuid("project_id")
      .$type<ProjectId>()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: outboxEventKindEnum("kind").notNull(),
    schemaVersion: integer("schema_version").default(1).notNull(),
    payload: jsonb("payload").$type<OutboxPayload>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("outbox_events_project_sequence_idx").on(table.projectId, table.sequence)],
);
