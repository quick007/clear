import type {
  IngestKeyId,
  IngestKeyName,
  ProjectId,
  ProjectName,
  ProjectSlug,
  UserId,
} from "@groundtruth/domain";
import { Schema } from "effect";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts.ts";
import { projectLifecycleEnum, projectModeEnum } from "./enums.ts";

const PositiveQuota = Schema.Int.check(Schema.isGreaterThan(0));

export const ProjectQuotas = Schema.Struct({
  maxIngestBytesPerMinute: PositiveQuota,
  maxActiveSeries: PositiveQuota,
  maxPanels: PositiveQuota,
});
export type ProjectQuotas = typeof ProjectQuotas.Type;

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").$type<ProjectId>().primaryKey(),
    ownerId: uuid("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    slug: text("slug").$type<ProjectSlug>().notNull(),
    name: text("name").$type<ProjectName>().notNull(),
    mode: projectModeEnum("mode").notNull(),
    lifecycle: projectLifecycleEnum("lifecycle").default("active").notNull(),
    retentionDays: integer("retention_days").default(1).notNull(),
    quotas: jsonb("quotas").$type<ProjectQuotas>().notNull(),
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true, mode: "date" }),
    purgeStartedAt: timestamp("purge_started_at", { withTimezone: true, mode: "date" }),
    purgeAttempt: integer("purge_attempt").default(0).notNull(),
    purgeError: text("purge_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("projects_owner_slug_unique").on(table.ownerId, table.slug),
    uniqueIndex("projects_project_id_unique").on(table.id),
    index("projects_owner_lifecycle_idx").on(table.ownerId, table.lifecycle),
  ],
);

export const ingestKeys = pgTable(
  "ingest_keys",
  {
    id: uuid("id").$type<IngestKeyId>().primaryKey(),
    projectId: uuid("project_id")
      .$type<ProjectId>()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").$type<IngestKeyName>().notNull(),
    keyPrefix: text("key_prefix").notNull(),
    secretHash: text("secret_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("ingest_keys_prefix_unique").on(table.keyPrefix),
    index("ingest_keys_project_created_idx").on(table.projectId, table.createdAt),
  ],
);
