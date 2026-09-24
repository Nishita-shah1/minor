CREATE TYPE "public"."document_status" AS ENUM('PENDING', 'READY', 'FAILED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('NOT_REQUESTED', 'SENDING', 'ACCEPTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."share_permission" AS ENUM('VIEW_ONLY', 'VIEW_AND_DOWNLOAD');--> statement-breakpoint
CREATE TYPE "public"."share_status" AS ENUM('AWAITING_RECIPIENT_KEY', 'ACTIVE', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_key_envelopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"wrapped_file_key" text NOT NULL,
	"wrapping_algorithm" text DEFAULT 'RSA-OAEP-3072-SHA-256' NOT NULL,
	"key_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_clerk_user_id" text NOT NULL,
	"r2_object_key" text NOT NULL,
	"status" "document_status" DEFAULT 'PENDING' NOT NULL,
	"ciphertext_size" bigint,
	"encrypted_metadata" text,
	"metadata_iv" text,
	"file_iv" text,
	"crypto_version" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"sender_clerk_user_id" text NOT NULL,
	"permission" "share_permission" NOT NULL,
	"expires_at" timestamp with time zone,
	"email_status" "email_status" DEFAULT 'NOT_REQUESTED' NOT NULL,
	"email_attempt_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"sender_clerk_user_id" text NOT NULL,
	"recipient_clerk_user_id" text,
	"recipient_email_normalized" text NOT NULL,
	"permission" "share_permission" NOT NULL,
	"status" "share_status" NOT NULL,
	"provider_message_id" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_key_bundles" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"public_key_jwk" jsonb NOT NULL,
	"public_key_fingerprint" text NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"private_key_iv" text NOT NULL,
	"kdf_salt" text NOT NULL,
	"kdf_parameters" jsonb NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_key_envelopes" ADD CONSTRAINT "document_key_envelopes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_batches" ADD CONSTRAINT "share_batches_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_batch_id_share_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."share_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_events_share_idx" ON "access_events" USING btree ("share_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_envelope_user_idx" ON "document_key_envelopes" USING btree ("document_id","clerk_user_id");--> statement-breakpoint
CREATE INDEX "document_envelope_lookup_idx" ON "document_key_envelopes" USING btree ("document_id","clerk_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_r2_object_key_idx" ON "documents" USING btree ("r2_object_key");--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_clerk_user_id");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "share_batches_document_idx" ON "share_batches" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "shares_recipient_user_idx" ON "shares" USING btree ("recipient_clerk_user_id");--> statement-breakpoint
CREATE INDEX "shares_recipient_email_idx" ON "shares" USING btree ("recipient_email_normalized");--> statement-breakpoint
CREATE INDEX "shares_status_idx" ON "shares" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shares_expiry_idx" ON "shares" USING btree ("expires_at");