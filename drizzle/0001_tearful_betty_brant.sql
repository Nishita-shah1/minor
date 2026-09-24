CREATE TYPE "public"."upload_group_status" AS ENUM('PROTECTING', 'PARTIAL', 'READY', 'DELETING', 'DELETED');--> statement-breakpoint
ALTER TYPE "public"."document_status" ADD VALUE 'DELETING' BEFORE 'DELETED';--> statement-breakpoint
ALTER TYPE "public"."share_status" ADD VALUE 'DELETED';--> statement-breakpoint
CREATE TABLE "upload_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_clerk_user_id" text NOT NULL,
	"status" "upload_group_status" DEFAULT 'PROTECTING' NOT NULL,
	"expected_file_count" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "share_batches" RENAME COLUMN "document_id" TO "group_id";--> statement-breakpoint
ALTER TABLE "shares" RENAME COLUMN "document_id" TO "group_id";--> statement-breakpoint
ALTER TABLE "share_batches" DROP CONSTRAINT "share_batches_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "shares" DROP CONSTRAINT "shares_document_id_documents_id_fk";
--> statement-breakpoint
DROP INDEX "share_batches_document_idx";--> statement-breakpoint
DROP INDEX "shares_expiry_idx";--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "r2_object_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "share_batches" ADD COLUMN "available_from" timestamp with time zone;--> statement-breakpoint
INSERT INTO "upload_groups" ("id", "owner_clerk_user_id", "status", "expected_file_count", "deleted_at", "created_at", "updated_at")
SELECT "id", "owner_clerk_user_id",
  CASE
    WHEN "status" = 'READY' THEN 'READY'::"upload_group_status"
    WHEN "status" = 'DELETED' THEN 'DELETED'::"upload_group_status"
    WHEN "status" = 'FAILED' THEN 'PARTIAL'::"upload_group_status"
    ELSE 'PROTECTING'::"upload_group_status"
  END,
  1,
  CASE WHEN "status" = 'DELETED' THEN now() ELSE NULL END,
  "created_at", "updated_at"
FROM "documents";--> statement-breakpoint
UPDATE "documents" SET "group_id" = "id";--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "upload_groups_owner_idx" ON "upload_groups" USING btree ("owner_clerk_user_id");--> statement-breakpoint
CREATE INDEX "upload_groups_status_idx" ON "upload_groups" USING btree ("status");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_group_id_upload_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."upload_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_batches" ADD CONSTRAINT "share_batches_group_id_upload_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."upload_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_group_id_upload_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."upload_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_group_idx" ON "documents" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_batches_group_idx" ON "share_batches" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "share_batches_schedule_idx" ON "share_batches" USING btree ("available_from","expires_at");--> statement-breakpoint
ALTER TABLE "shares" DROP COLUMN "expires_at";
