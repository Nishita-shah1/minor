CREATE TYPE "public"."viewing_session_status" AS ENUM('OPEN', 'EXPIRED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" text NOT NULL,
	"marked" integer DEFAULT 0 NOT NULL,
	"visible" integer DEFAULT 0 NOT NULL,
	"fullscreen" integer DEFAULT 0 NOT NULL,
	"authorized" integer DEFAULT 0 NOT NULL,
	"page_index" integer,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viewing_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"status" "viewing_session_status" DEFAULT 'OPEN' NOT NULL,
	"browser_family" text,
	"platform_category" text,
	"viewport_bucket" text,
	"dpr_bucket" text,
	"webgpu_outcome" text,
	"estimated_visible_ms" integer DEFAULT 0 NOT NULL,
	"last_visible_credit_at" timestamp with time zone,
	"last_server_event_at" timestamp with time zone,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_viewing_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."viewing_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewing_sessions" ADD CONSTRAINT "viewing_sessions_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewing_sessions" ADD CONSTRAINT "viewing_sessions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_events_sequence_idx" ON "session_events" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE INDEX "session_events_session_idx" ON "session_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "viewing_sessions_share_idx" ON "viewing_sessions" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "viewing_sessions_document_idx" ON "viewing_sessions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "viewing_sessions_owner_lookup_idx" ON "viewing_sessions" USING btree ("document_id","share_id");--> statement-breakpoint
CREATE INDEX "viewing_sessions_user_opened_idx" ON "viewing_sessions" USING btree ("clerk_user_id","opened_at");