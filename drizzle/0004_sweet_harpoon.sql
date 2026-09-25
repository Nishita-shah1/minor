CREATE TABLE "invitation_grants" (
	"share_id" uuid PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"proof" text NOT NULL,
	"owner_wrapped_secret" text NOT NULL,
	"fingerprints" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "email_status" "email_status" DEFAULT 'NOT_REQUESTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "email_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "shares" ADD COLUMN "email_updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "shares" SET "email_status" = 'ACCEPTED' WHERE "provider_message_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation_grants" ADD CONSTRAINT "invitation_grants_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."shares"("id") ON DELETE cascade ON UPDATE no action;
