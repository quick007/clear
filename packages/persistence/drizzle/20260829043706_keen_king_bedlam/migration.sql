CREATE TABLE "manual_alerts" (
	"id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"service_name" text,
	"context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "retention_days" SET DEFAULT 1;--> statement-breakpoint
UPDATE "projects"
SET
	"retention_days" = 1,
	"quotas" = '{"maxIngestBytesPerMinute":5000000,"maxActiveSeries":5000,"maxPanels":12}'::jsonb,
	"updated_at" = now()
WHERE "mode" = 'hosted';--> statement-breakpoint
CREATE UNIQUE INDEX "manual_alerts_project_id_id_unique" ON "manual_alerts" ("project_id","id");--> statement-breakpoint
CREATE INDEX "manual_alerts_project_created_idx" ON "manual_alerts" ("project_id","created_at");--> statement-breakpoint
ALTER TABLE "manual_alerts" ADD CONSTRAINT "manual_alerts_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
