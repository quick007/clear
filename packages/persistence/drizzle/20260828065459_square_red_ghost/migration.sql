CREATE TYPE "alert_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "alert_status" AS ENUM('healthy', 'firing', 'resolved');--> statement-breakpoint
CREATE TYPE "hypothesis_status" AS ENUM('proposed', 'testing', 'rejected', 'confirmed');--> statement-breakpoint
CREATE TYPE "incident_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "outbox_event_kind" AS ENUM('project.created', 'project.updated', 'project.deletion_requested', 'project.deletion_progressed', 'dashboard.created', 'dashboard.updated', 'dashboard.removed', 'panel.created', 'panel.updated', 'panel.removed', 'alert.created', 'alert.updated', 'alert.state_changed', 'incident.opened', 'incident.updated', 'incident.closed', 'hypothesis.changed', 'timeline.entry_added', 'deploy.recorded', 'ingest_key.created', 'ingest_key.revoked');--> statement-breakpoint
CREATE TYPE "project_lifecycle" AS ENUM('active', 'deletion-requested', 'deleting', 'deletion-failed');--> statement-breakpoint
CREATE TYPE "project_mode" AS ENUM('hosted', 'self-hosted');--> statement-breakpoint
CREATE TYPE "timeline_entry_kind" AS ENUM('note', 'hypothesis', 'deploy', 'incident-status');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY,
	"hosted_subject" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_handoff_codes" (
	"code_hash" text PRIMARY KEY,
	"hosted_subject" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"return_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hosted_sessions" (
	"id" uuid PRIMARY KEY,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"service_name" text,
	"metric_name" text NOT NULL,
	"aggregation" text NOT NULL,
	"comparison" text NOT NULL,
	"threshold" real NOT NULL,
	"window_seconds" integer NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"status" "alert_status" DEFAULT 'healthy'::"alert_status" NOT NULL,
	"summary" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"firing_since" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panels" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"title" text NOT NULL,
	"spec" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deploy_events" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"service_name" text NOT NULL,
	"sha" text NOT NULL,
	"description" text,
	"url" text,
	"deployed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hypotheses" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"text" text NOT NULL,
	"status" "hypothesis_status" DEFAULT 'proposed'::"hypothesis_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "incident_status" DEFAULT 'open'::"incident_status" NOT NULL,
	"summary" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_entries" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"kind" "timeline_entry_kind" NOT NULL,
	"text" text NOT NULL,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"sequence" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_events_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" uuid NOT NULL,
	"kind" "outbox_event_kind" NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_keys" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY,
	"owner_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"mode" "project_mode" NOT NULL,
	"lifecycle" "project_lifecycle" DEFAULT 'active'::"project_lifecycle" NOT NULL,
	"retention_days" integer DEFAULT 7 NOT NULL,
	"quotas" jsonb NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"purge_started_at" timestamp with time zone,
	"purge_attempt" integer DEFAULT 0 NOT NULL,
	"purge_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_hosted_subject_unique" ON "accounts" ("hosted_subject");--> statement-breakpoint
CREATE INDEX "auth_handoff_codes_expires_idx" ON "auth_handoff_codes" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hosted_sessions_token_hash_unique" ON "hosted_sessions" ("token_hash");--> statement-breakpoint
CREATE INDEX "hosted_sessions_account_expires_idx" ON "hosted_sessions" ("account_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_project_id_id_unique" ON "alerts" ("project_id","id");--> statement-breakpoint
CREATE INDEX "alerts_project_status_idx" ON "alerts" ("project_id","status","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboards_project_id_id_unique" ON "dashboards" ("project_id","id");--> statement-breakpoint
CREATE INDEX "dashboards_project_created_idx" ON "dashboards" ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "panels_project_id_id_unique" ON "panels" ("project_id","id");--> statement-breakpoint
CREATE INDEX "panels_project_dashboard_position_idx" ON "panels" ("project_id","dashboard_id","position");--> statement-breakpoint
CREATE INDEX "deploy_events_project_service_time_idx" ON "deploy_events" ("project_id","service_name","deployed_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "hypotheses_project_id_id_unique" ON "hypotheses" ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "hypotheses_incident_text_unique" ON "hypotheses" ("project_id","incident_id","text");--> statement-breakpoint
CREATE INDEX "hypotheses_project_incident_status_idx" ON "hypotheses" ("project_id","incident_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_project_id_id_unique" ON "incidents" ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_one_open_per_project_unique" ON "incidents" ("project_id") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "incidents_project_status_opened_idx" ON "incidents" ("project_id","status","opened_at");--> statement-breakpoint
CREATE INDEX "timeline_entries_project_incident_time_idx" ON "timeline_entries" ("project_id","incident_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "outbox_events_project_sequence_idx" ON "outbox_events" ("project_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "ingest_keys_prefix_unique" ON "ingest_keys" ("key_prefix");--> statement-breakpoint
CREATE INDEX "ingest_keys_project_created_idx" ON "ingest_keys" ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_owner_slug_unique" ON "projects" ("owner_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_project_id_unique" ON "projects" ("id");--> statement-breakpoint
CREATE INDEX "projects_owner_lifecycle_idx" ON "projects" ("owner_id","lifecycle");--> statement-breakpoint
ALTER TABLE "hosted_sessions" ADD CONSTRAINT "hosted_sessions_account_id_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "panels" ADD CONSTRAINT "panels_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "panels" ADD CONSTRAINT "panels_project_dashboard_fk" FOREIGN KEY ("project_id","dashboard_id") REFERENCES "dashboards"("project_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deploy_events" ADD CONSTRAINT "deploy_events_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "hypotheses" ADD CONSTRAINT "hypotheses_project_incident_fk" FOREIGN KEY ("project_id","incident_id") REFERENCES "incidents"("project_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_project_incident_fk" FOREIGN KEY ("project_id","incident_id") REFERENCES "incidents"("project_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ingest_keys" ADD CONSTRAINT "ingest_keys_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_accounts_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "accounts"("id") ON DELETE RESTRICT;