import type {
  DeployEventId,
  HypothesisId,
  IncidentId,
  IncidentTitle,
  NonEmptyText,
  ProjectId,
  ServiceName,
  Sha,
  TimelineEntryId,
  Url,
} from "@groundtruth/domain";
import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { hypothesisStatusEnum, incidentStatusEnum, timelineEntryKindEnum } from "./enums.ts";
import { projects } from "./projects.ts";

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").$type<IncidentId>().primaryKey(),
    projectId: uuid("project_id")
      .$type<ProjectId>()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").$type<IncidentTitle>().notNull(),
    status: incidentStatusEnum("status").default("open").notNull(),
    summary: text("summary").$type<NonEmptyText>(),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("incidents_project_id_id_unique").on(table.projectId, table.id),
    uniqueIndex("incidents_one_open_per_project_unique")
      .on(table.projectId)
      .where(sql`${table.status} = 'open'`),
    index("incidents_project_status_opened_idx").on(table.projectId, table.status, table.openedAt),
  ],
);

export const hypotheses = pgTable(
  "hypotheses",
  {
    id: uuid("id").$type<HypothesisId>().primaryKey(),
    projectId: uuid("project_id")
      .$type<ProjectId>()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id").$type<IncidentId>().notNull(),
    text: text("text").$type<NonEmptyText>().notNull(),
    status: hypothesisStatusEnum("status").default("proposed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "hypotheses_project_incident_fk",
      columns: [table.projectId, table.incidentId],
      foreignColumns: [incidents.projectId, incidents.id],
    }).onDelete("cascade"),
    uniqueIndex("hypotheses_project_id_id_unique").on(table.projectId, table.id),
    uniqueIndex("hypotheses_incident_text_unique").on(
      table.projectId,
      table.incidentId,
      table.text,
    ),
    index("hypotheses_project_incident_status_idx").on(
      table.projectId,
      table.incidentId,
      table.status,
    ),
  ],
);

export const timelineEntries = pgTable(
  "timeline_entries",
  {
    id: uuid("id").$type<TimelineEntryId>().primaryKey(),
    projectId: uuid("project_id")
      .$type<ProjectId>()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id").$type<IncidentId>().notNull(),
    kind: timelineEntryKindEnum("kind").notNull(),
    text: text("text").$type<NonEmptyText>().notNull(),
    metadata: jsonb("metadata").$type<Readonly<Record<string, string | number | boolean | null>>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "timeline_entries_project_incident_fk",
      columns: [table.projectId, table.incidentId],
      foreignColumns: [incidents.projectId, incidents.id],
    }).onDelete("cascade"),
    index("timeline_entries_project_incident_time_idx").on(
      table.projectId,
      table.incidentId,
      table.occurredAt,
      table.id,
    ),
  ],
);

export const deployEvents = pgTable(
  "deploy_events",
  {
    id: uuid("id").$type<DeployEventId>().primaryKey(),
    projectId: uuid("project_id")
      .$type<ProjectId>()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    serviceName: text("service_name").$type<ServiceName>().notNull(),
    sha: text("sha").$type<Sha>().notNull(),
    description: text("description").$type<NonEmptyText>(),
    url: text("url").$type<Url>(),
    deployedAt: timestamp("deployed_at", { withTimezone: true, mode: "date" }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("deploy_events_project_service_time_idx").on(
      table.projectId,
      table.serviceName,
      table.deployedAt,
      table.id,
    ),
  ],
);
