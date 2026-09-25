CREATE TABLE "copy_fingerprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"share_id" uuid NOT NULL,
	"owner_wrapped_key" text NOT NULL,
	"recipient_wrapped_key" text NOT NULL,
	"profile_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "copy_fingerprints" ADD CONSTRAINT "copy_fingerprints_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_fingerprints" ADD CONSTRAINT "copy_fingerprints_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "copy_fingerprints_document_share_idx" ON "copy_fingerprints" USING btree ("document_id","share_id");