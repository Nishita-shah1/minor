ALTER TABLE "access_events" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "access_events" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "camera_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "access_events_type_created_idx" ON "access_events" USING btree ("event_type","created_at");
