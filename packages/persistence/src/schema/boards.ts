import type {
  AlertAggregation,
  AlertComparison,
  AlertId,
  AlertName,
  DashboardName,
  DashboardId,
  NonEmptyText,
  PanelId,
  PanelTitle,
  ProjectId,
  ServiceName,
} from "@groundtruth/domain";
import type { PanelSpec } from "@groundtruth/panel-dsl";
import type { EncodedPanelAnnotationRecord } from "../records.ts";
import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { alertSeverityEnum, alertStatusEnum } from "./enums.ts";
import { projects } from "./projects.ts";

export const dashboards = pgTable(
  "dashboards",
  {
    id: uuid("id").$type<DashboardId>().primaryKey(),
    projectId: uuid("project_id")
      .$type<ProjectId>()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").$type<DashboardName>().notNull(),
    description: text("description").$type<NonEmptyText>(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("dashboards_project_id_id_unique").on(table.projectId, table.id),
    uniqueIndex("dashboards_one_default_per_project_unique")
      .on(table.projectId)
      .where(sql`${table.isDefault} = true`),
    index("dashboards_project_created_idx").on(table.projectId, table.createdAt),
  ],
);

export const panels = pgTable(
  "panels",
  {
    id: uuid("id").$type<PanelId>().primaryKey(),
    projectId: uuid("project_id")
      .$type<ProjectId>()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    dashboardId: uuid("dashboard_id").$type<DashboardId>().notNull(),
    title: text("title").$type<PanelTitle>().notNull(),
    spec: jsonb("spec").$type<PanelSpec>().notNull(),
    annotations: jsonb("annotations")
      .$type<ReadonlyArray<EncodedPanelAnnotationRecord>>()
      .default([])
      .notNull(),
    position: integer("position").default(0).notNull(),
    revision: integer("revision").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "panels_project_dashboard_fk",
      columns: [table.projectId, table.dashboardId],
      foreignColumns: [dashboards.projectId, dashboards.id],
    }).onDelete("cascade"),
    uniqueIndex("panels_project_id_id_unique").on(table.projectId, table.id),
    index("panels_project_dashboard_position_idx").on(
      table.projectId,
      table.dashboardId,
      table.position,
    ),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").$type<AlertId>().primaryKey(),
    projectId: uuid("project_id")
      .$type<ProjectId>()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").$type<AlertName>().notNull(),
    serviceName: text("service_name").$type<ServiceName>(),
    metricName: text("metric_name").notNull(),
    aggregation: text("aggregation").$type<AlertAggregation>().notNull(),
    comparison: text("comparison").$type<AlertComparison>().notNull(),
    threshold: real("threshold").notNull(),
    windowSeconds: integer("window_seconds").notNull(),
    severity: alertSeverityEnum("severity").notNull(),
    status: alertStatusEnum("status").default("healthy").notNull(),
    summary: text("summary").$type<NonEmptyText>(),
    enabled: boolean("enabled").default(true).notNull(),
    firingSince: timestamp("firing_since", { withTimezone: true, mode: "date" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("alerts_project_id_id_unique").on(table.projectId, table.id),
    index("alerts_project_status_idx").on(table.projectId, table.status, table.severity),
  ],
);

export const manualAlerts = pgTable(
  "manual_alerts",
  {
    id: uuid("id").$type<AlertId>().primaryKey(),
    projectId: uuid("project_id")
      .$type<ProjectId>()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").$type<AlertName>().notNull(),
    severity: alertSeverityEnum("severity").notNull(),
    serviceName: text("service_name").$type<ServiceName>(),
    context: text("context").$type<NonEmptyText>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("manual_alerts_project_id_id_unique").on(table.projectId, table.id),
    index("manual_alerts_project_created_idx").on(table.projectId, table.createdAt),
  ],
);
